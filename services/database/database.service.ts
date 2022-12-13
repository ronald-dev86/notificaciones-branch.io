import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SQLitePorter } from '@ionic-native/sqlite-porter';
import { SQLite, SQLiteObject } from "@ionic-native/sqlite";
import { Platform } from "ionic-angular";
import { BehaviorSubject } from 'rxjs';
import { inityDB, database, runSQL, runSQLBatch } from './sqlite';
import * as globals from '../../app/globals';
import { ConfigService } from '../config.service';
import { TranslateService } from 'ng2-translate';
import { UtilService } from '../util.service';
import { StorageService } from '../storage.service';

@Injectable()
export class DbService {

  //private storage: any;

  isReadyDb: BehaviorSubject <number> = new BehaviorSubject(0);
  tableVersion:any;
  commit:any;
  lastConfig:any;

  constructor(
    private platform: Platform,
    private sqlite: SQLite,
    private sqlitePorter: SQLitePorter,
    private http: HttpClient,
    private configService: ConfigService,
    private translate:TranslateService,
    private utilService : UtilService) {
      this.processTablesAndData();
    }
  async processTablesAndData() {
    this.getReadyDB().subscribe(async (status)=>{
      switch (status) {
        case 0: // status de creacion de bd por platforma y crea de la instacia para el uso de la db
          console.log('status 0')
          inityDB(this.platform, this.sqlite, this.isReadyDb);
          break;
        case 1: // creado de tablas por medio del json que esta en assest instalacion de  apps y actulizaciones por tiendas de apps
          console.log('status 1')
          await this.setTableVersion()
          console.log(this.tableVersion)
          if(this.tableVersion.rows.length > 0){
            this.isReadyDb.next(2);
            return;
          }
          const sqlTable: any = await this.http.get('assets/seed.sql.json', { responseType: 'text'}).toPromise();
          const toJsonTable: any = JSON.parse(sqlTable);
          this.excuteSQLTables(toJsonTable.create,2);
          break;
        case 2: //llenado de data de distintas tablas por primera vez y actulizacion de apps
          console.log('status 2')
          console.log('tableversion',this.tableVersion.rows.length)
          this.commit = await runSQL(database)("SELECT hash FROM version where hash = ?",[globals.lastCommitHash]);
          console.log('commit',this.commit.rows.length)
          if(this.commit.rows.length > 0){
            const config =  await this.configService.getConfig();
            if(!config) await this.savedTableConfigStorage();
            this.isReadyDb.next(4);
            return;
          }else if(this.tableVersion.rows.length > 0){
            this.isReadyDb.next(3)
            return;
          }
          const sql = await this.http.get('assets/seed.sql.json', { responseType: 'text'}).toPromise();
          const toJson = JSON.parse(sql);
          this.excuteSQLData(toJson, 4);
          break;
        case 3:// eliminacion de tablas para actualizacion por tiendas y actulizacion por servicio de la tablas de configuracion.
        console.log('status 3')
        this.commit = await runSQL(database)("SELECT hash FROM version where hash = ?",[globals.lastCommitHash]);
        console.log(this.commit.rows)
        if(this.commit.rows.length == 0){
            this.tableVersion = undefined;
            const sql = await this.http.get('assets/seed.sql.json', { responseType: 'text'}).toPromise();
            const toJson = JSON.parse(sql);
            this.excuteSQLDrop(toJson.drop,1);
          }else{
            this.excuteSQLDrop(this.lastConfig.drop,6);
          }
          break;
        case 4: // status OK para inicializacion de otros servicio sin estatus 4 la app no funciona
          console.log('status  4')

          break;
        case 5:// se activa cuando tenemos seccion y pregunta las back si es la misma version
          console.log('status 5')
          this.tableVersionQuery();
          break;
        case 6:// se crean la tablas que llegen en el servicio de actulizacion
          console.log('status 6')
          this.excuteSQLTables(this.lastConfig.create, 7);
          break;
        case 7:// se guarda la infomracion que llega del servicio de actualizacion
          console.log('status 7')
          this.excuteSQLData(this.lastConfig, 8);
          break;
      }
    })
  }


  getReadyDB(){
    return this.isReadyDb.asObservable();
  }

  async configurationStateChange(){
    const isLogged = await this.utilService.isLoggedIn();
    if(!isLogged) return;
    this.isReadyDb.next(5);
  }

  async excuteSQLTables(sqlTable, status): Promise<void>{
    try {
      console.log('excuteSQLTables',sqlTable)
      sqlTable.forEach(async(element, index) => {
        const result = await runSQL(database)(`${element};`,[]);
        if(index == sqlTable.length -1 && result){
          this.isReadyDb.next(status);
          await this.setTableVersion();
          await this.rewriteLang();
        }
      });
    } catch (error) {
      throw new Error(`Error en la consulta archivo sql ${error}`);
    }
  }

  async excuteSQLData(toJson, status): Promise<void>{
    try {
      const result = await runSQLBatch(database)(toJson.rows);
      if(result) {
        await this.savedTableConfigStorage();
        this.isReadyDb.next(status)
      }
    }catch(error){
      console.error(error )
    }
  }

  async excuteSQLDrop(dropJson, status): Promise<void>{
    try {
      dropJson.forEach(async(element, index) => {
          const result = await runSQL(database)(`${element};`,[]);
          if(index == dropJson.length -1 && result) this.isReadyDb.next(status);
        });
    }catch(error){
      console.log(error);
    }
  }

  async setTableVersion(){
    this.tableVersion =  await runSQL(database)(`SELECT * FROM sqlite_master WHERE type='table' AND name='version';`,[]);
  }

  async tableVersionQuery(){
    try {
      const lang = this.translate.getLangs();
      const versionLang = await this.translate.get("versionLang").toPromise();

      const version:any = await runSQL(database)("SELECT * FROM config WHERE key IN ('SQL_CONFIG_VERSION', 'SQL_TABS_MENU_VERSION')",[]);
      //[versionLang, lang[0]]
      console.log('lang', lang, 'versionLang', versionLang);
      const arrayVersion = []

      for(let i = 0 ; i < version.rows.length; i++){
        arrayVersion.push(version.rows.item(i));
      }
      arrayVersion.push({key:"SQL_TRANSLATION_VERSION", value:['es',1]})
      this.lastConfig = await this.configService.updateConfigSql({data:arrayVersion}).toPromise();
      if(this.lastConfig.drop.length === 0) return this.isReadyDb.next(8)
      this.isReadyDb.next(3)
    } catch (error) {
      console.log('error tableVersionQuery',error)
    }
  }
  async savedTableConfigStorage(){
    const data: any = await runSQL(database)("SELECT * FROM config",[]);
    let config = new Object();
    for(let i=0; i < data.rows.length; i++){
      const name = data.rows.item(i)['key'].toLowerCase();
      let value = data.rows.item(i)['value']
      if(value === 'true') value = true;
      if(value === 'false') value = false;
      config[`${name}`] = value;
    }
    await this.configService.setConfig(config)
    return;
  }

  async rewriteLang(){
    if(this.lastConfig === undefined) return;

    if(this.lastConfig.lang.length === 0) return;

    for (let i = 0; i < this.lastConfig.lang.length; i++) {
      this.translate.setTranslation(this.lastConfig.lang[i],this.lastConfig.translate[i],false);
    }
  }
}
