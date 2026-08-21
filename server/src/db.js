import pg from 'pg';

const { Pool, types } = pg;

// Postgres 的 DATE 类型默认会被 node-postgres 转成本地时区的 JS Date 对象，
// 序列化成 JSON 时会变成带时区的 ISO 字符串（容易因为时区差出现"差一天"的 bug）。
// 这里改成直接保留数据库返回的原始 'YYYY-MM-DD' 字符串，最简单也最不容易出错。
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}
