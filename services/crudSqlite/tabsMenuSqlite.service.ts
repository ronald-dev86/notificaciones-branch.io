import { Injectable } from "@angular/core";
import { DbService } from "../database/database.service";
import { CrudService } from "./crudSqlite.services";


@Injectable()
export class TabsMenuSqliteService extends CrudService {
  table = 'tabs_menu';
  constructor(databaseService: DbService) {
    super(databaseService);
  }
}