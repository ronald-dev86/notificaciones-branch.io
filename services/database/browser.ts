export const browserDBInstance = (db) => {

  return {
    executeSql: (sql,data=[]) => {
      return new Promise((resolve, reject) => {
        db.transaction((tx) => {
          tx.executeSql(sql, data, (tx, rs) => {
            resolve(rs)
          }, (error) => {
            reject(error);
          });
        });
      })
    },
    sqlBatch: (arr) => {
      return new Promise((r, rr) => {
        let batch = [];
        db.transaction((tx) => {
          for (let i = 0; i < arr.length; i++) {
            batch.push(new Promise((resolve, reject) => {
              tx.executeSql(arr[i], [], () => { resolve(true) })
            }))
            Promise.all(batch).then(() => r(true));
          }
        });
      })
    }
  }
}