export function jsonError(message: string, status: number, code: string) {
  return Response.json({ error: { code, message } }, { status })
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json({ data }, { status })
}