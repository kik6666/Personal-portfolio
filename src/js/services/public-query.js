export async function runPublicQuery(query, contentDescription) {
  const { data, error } = await query

  if (error) {
    throw new Error(`Unable to load ${contentDescription}: ${error.message}`, {
      cause: error,
    })
  }

  if (!Array.isArray(data)) {
    throw new Error(`Unable to load ${contentDescription}: received an invalid response.`)
  }

  return data
}
