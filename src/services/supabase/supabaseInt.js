class SupaInterface {
  constructor(client) {
    this.client = client;

    // --- LECTURA: supa.get.Tabla() o supa.get.Tabla.columna(id) ---
    this.get = new Proxy({}, {
      get: (target, tableName) => {
        if (tableName === 'row') {
          return (actualTableName) => {
            return async (rowName) => {
              const { data, error } = await this.client.from(actualTableName).select('*').eq('name', rowName).single();
              if (error) throw error;
              return data;
            };
          };
        }
        const tableFunc = async () => {
          const { data, error } = await this.client.from(tableName).select('*');
          if (error) throw error;
          return data;
        };
        return new Proxy(tableFunc, {
          get: (t, columnName) => async (id) => {
            const { data, error } = await this.client.from(tableName).select(columnName).eq('id', id).single();
            return error ? null : data[columnName];
          }
        });
      }
    });

    // --- ESCRITURA: supa.write.Tabla.columna(id, valor) (SOLO UPDATE) ---
    this.write = new Proxy({}, {
      get: (target, tableName) => new Proxy({}, {
        get: (target, columnName) => async (id, value) => {
          const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
          const { data, error } = await this.client.rpc('dynamic_write', {
            t_name: tableName, c_name: columnName, row_id: id, new_val: valStr
          });
          if (error) throw error;
          if (data.startsWith('Error')) console.warn(`[ERROR] ${data}`);
          else console.log(`[SUCCES] ${tableName}.${columnName} actualizado.`);
          return { success: !data.startsWith('Error'), message: data };
        }
      })
    });

    // --- CREACIÓN: supa.create.Tabla({datos}) ---
    this.create = new Proxy({}, {
      get: (target, tableName) => async (objData) => {
        const { data, error } = await this.client.from(tableName).insert([objData]).select();
        if (error) throw error;
        console.log(`[SUCCES] Fila creada en ${tableName}.`);
        return data;
      }
    });

    // --- BÚSQUEDA: supa.search.Tabla.row(query) ---
    this.search = new Proxy({}, {
      get: (target, tableName) => new Proxy({}, {
        get: (target, columnName) => async (query) => {
          const { data, error } = await this.client.rpc('dynamic_search', {
            t_name: tableName, c_name: columnName, q_query: query
          });
          if (error) throw error;
          return data;
        }
      })
    });

    // --- ELIMINACIÓN: supa.delete.Tabla(id) ---
    this.delete = new Proxy({}, {
      get: (target, tableName) => async (id) => {
        const { error } = await this.client.from(tableName).delete().eq('id', id);
        if (error) throw error;
        console.log(`[SUCCES] Fila ${id} eliminada de ${tableName}.`);
        return { success: true };
      }
    });
  }

  async get_tables() {
    const { data, error } = await this.client.rpc('get_tables');
    if (error) throw error;
    return data.map(t => typeof t === 'object' ? t.name : t);
  }
}

module.exports = SupaInterface;