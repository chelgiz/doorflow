export function parseDatabaseConnection(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${variableName} must use PostgreSQL`);
  }

  const password = decodeURIComponent(url.password);
  url.password = "";
  url.searchParams.delete("schema");
  const username = url.username ? `${url.username}@` : "";
  const connectionString = `${url.protocol}//${username}${url.host}${url.pathname}${url.search}${url.hash}`;
  return { connectionString, password, url };
}

export function databaseIdentity(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

export function getClientConnectionString(connection) {
  const url = new URL(connection.connectionString);
  if (connection.password) url.password = connection.password;
  return url.toString();
}
