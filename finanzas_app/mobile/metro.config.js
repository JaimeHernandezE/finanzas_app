const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Monorepo: Metro debe observar `shared/` fuera de `mobile/`
config.watchFolders = [workspaceRoot]

// Código en `../shared` debe resolver dependencias desde `mobile/node_modules`
// (si no, Metro busca `react` dentro de `shared/` y falla).
const mobileNodeModules = path.resolve(projectRoot, 'node_modules')
config.resolver.nodeModulesPaths = [
  mobileNodeModules,
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(mobileNodeModules, String(name)),
  }
)

module.exports = config
