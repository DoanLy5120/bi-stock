import sql from 'mssql';

import { config } from './config.js';

let poolPromise = null;

const poolConfig = () => {
  const options = {
    encrypt: config.db.encrypt,
    trustServerCertificate: config.db.trustServerCertificate,
    useUTC: true,
    enableArithAbort: true,
  };
  if (config.db.instanceName) options.instanceName = config.db.instanceName;

  return {
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    options,
    pool: { min: 0, max: config.db.poolMax, idleTimeoutMillis: 30000 },
    requestTimeout: 30000,
    connectionTimeout: 15000,
  };
};

export const getPool = async () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(poolConfig())
      .connect()
      .catch((error) => {
        poolPromise = null;
        throw error;
      });
  }
  return poolPromise;
};

const applyInputs = (request, inputs) => {
  for (const input of inputs || []) {
    const type = input.type ? sql[input.type] : undefined;
    if (type) request.input(input.name, type, input.value);
    else request.input(input.name, input.value);
  }
};

export const createDb = () => ({
  async query(text, inputs = []) {
    const pool = await getPool();
    const request = pool.request();
    applyInputs(request, inputs);
    return request.query(text);
  },

  /** run: (text, inputs) => Promise<recordset> — all statements share one transaction. */
  async transaction(run) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const exec = (text, inputs = []) => {
        const request = new sql.Request(transaction);
        applyInputs(request, inputs);
        return request.query(text);
      };
      const result = await run(exec);
      await transaction.commit();
      return result;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* the original error is the useful one */
      }
      throw error;
    }
  },
});

export { sql };
