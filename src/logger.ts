export const logger = {
  // eslint-disable-next-line no-console
  log: (message: string) => console.log(new Date().toISOString(), message),
}
