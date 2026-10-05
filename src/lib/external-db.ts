import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} para conectar con la base de datos externa de funcionarios.`,
    );
  }
  return value;
}

export function getExternalDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: requireEnv("EXTERNAL_DB_HOST"),
      port: Number(process.env.EXTERNAL_DB_PORT) || 3306,
      user: requireEnv("EXTERNAL_DB_USER"),
      password: requireEnv("EXTERNAL_DB_PASSWORD"),
      database: requireEnv("EXTERNAL_DB_NAME"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      charset: "utf8mb4",
    });
  }
  return pool;
}
