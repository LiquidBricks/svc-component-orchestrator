import { Errors } from '../../../../errors.js'

export function ensureComponentIdentifiers({ scope: { handlerDiagnostics, component } }) {
  const { hash, name, imports } = component

  handlerDiagnostics.require(
    hash,
    Errors.PRECONDITION_REQUIRED,
    'Component hash is required',
    { field: 'hash' },
  )
  handlerDiagnostics.require(
    name,
    Errors.PRECONDITION_REQUIRED,
    'Component name is required',
    { field: 'name' },
  )

  handlerDiagnostics.require(
    Array.isArray(imports),
    Errors.PRECONDITION_INVALID,
    'imports must be an array',
    { field: 'imports', component: name, hash },
  )
}
