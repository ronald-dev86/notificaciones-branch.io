import { SQLiteObject  } from '@ionic-native/sqlite';
import { browserDBInstance } from './browser';


const db_name = 'configsDB';
export let database: any = null;
export const inityDB = (platform, sqlite, isReadyDb)=>(async ()=>{

  if(!platform.is('cordova')){
    const instance = (<any>window).openDatabase(db_name, '1.0', 'DEV', 5 * 1024 * 1024);
    database = browserDBInstance(instance);
    isReadyDb.next(1);
    return;
  }
    try {
      sqlite.create({
        name: db_name,
        location: 'default'
      })
      .then((instance: SQLiteObject) => {
        database = instance;
        isReadyDb.next(1);
      });

    } catch (error) {
      throw new Error(`error al inicial la basede datos ${error}`);
    }

})();

export const runSQLBatch = (database) => (arraySql: any[]) =>(()=>{
  return new Promise((r, rr) => {
    let batch = [];
    for(let i=0; i < arraySql.length ; i++){
      batch.push(new Promise((resolve, reject) => {
        database.executeSql(arraySql[i]['stmt'], arraySql[i]['values'])
        .then(()=> resolve(true))
        .catch(()=> reject(false))
      }))
    }
    Promise.all(batch)
    .then(()=> r(true))
    .catch(()=> rr(false))
  });
})()

export const runSQL = (database) => (sql, params: any[] )=> (() => {

  return new Promise((resolve, reject)=>{
    database.executeSql(sql, params)
    .then((result)=>{
      console.log('runSQL',result)
      resolve(result)
    })
    .catch((error)=>reject(error))
  })
}
)();