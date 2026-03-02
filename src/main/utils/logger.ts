import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'

// Configure a specific path for easy retrieval if needed
log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs/main.log')
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

export default log
