import { Injectable } from '@angular/core';
import { DbService } from '../database/database.service';
import { inityDB, database, runSQL, runSQLBatch } from '../database/sqlite';


@Injectable()
export class CrudService {

  table: string = null;

  constructor( public databaseService: DbService) {
  }



  async create(data: any) {
    return  new Error('operacion no permitida')
  }

  async find() {
    const sql = `SELECT * FROM  ${this.table};`;
    return await runSQL(database)(sql, []);
  }

  async findById(id: number) {
    const sql = `SELECT * FROM  ${this.table} WHERE  id = ?;`;
    return await runSQL(database)(sql, [id]);
  }

  async findByParam(props: string, value: any) {
    const sql = `SELECT * FROM  ${this.table} WHERE  ${props.trim()} = ?;`;
    return await runSQL(database)(sql, [value]);
  }

  async findByParamAnd(props: string [], value: string[]) {
    const sql = `SELECT * FROM  ${this.table} WHERE ${props[0].trim()}= ? and ${props[1].trim()}= ?;`;
    return await runSQL(database)(sql, value);
  }

  async update(data: any, id: number) {
    return new Error(`Method not implemented. ${data} ${id}`);
  }

  async delete(id: number) {
    return new Error(`Method not implemented. ${id}`);
  }
}