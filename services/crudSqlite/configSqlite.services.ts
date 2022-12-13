import { Injectable } from "@angular/core";
import { DbService } from "../database/database.service";
import { CrudService } from "./crudSqlite.services";


@Injectable()
export class ConfigSqliteService extends CrudService {
  table = 'config';
  constructor(databaseService: DbService) {
    super(databaseService);
  }
}