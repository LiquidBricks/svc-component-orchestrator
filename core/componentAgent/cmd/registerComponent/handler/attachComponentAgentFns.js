import { Errors } from '../../../../../errors.js'

async function createAgentFnVertex({ dataMapper, agentFn }) {
  return dataMapper.vertex.agentFn.create(agentFn)
}

async function createComponentAgentFnEdge({ dataMapper, fromId, toId }) {
  return dataMapper.edge.has_agentFn.component_agentFn.create({ fromId, toId })
}

export async function attachComponentAgentFns({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, componentVID, componentAlreadyRegistered },
}) {
  if (componentAlreadyRegistered) return
  const { name: compName, hash: compHash, agentFns = [] } = component ?? {}
  if (!agentFns?.length) return

  handlerDiagnostics.require(
    Array.isArray(agentFns),
    Errors.PRECONDITION_INVALID,
    'agentFns must be an array',
    { field: 'agentFns', component: compName, hash: compHash },
  )

  const uniqueAgentFnNames = new Set()
  for (const agentFnItem of agentFns) {
    const { name: agentFnName, portAddr, hash: agentFnHash, codeRef } = agentFnItem ?? {}

    handlerDiagnostics.require(
      typeof agentFnName === 'string' && agentFnName.length,
      Errors.PRECONDITION_REQUIRED,
      'agentFn name required',
      { field: 'agentFn.name', component: compName, hash: compHash },
    )
    handlerDiagnostics.require(
      typeof portAddr === 'string' && portAddr.length,
      Errors.PRECONDITION_REQUIRED,
      'agentFn portAddr required',
      { field: 'agentFn.portAddr', component: compName, hash: compHash, agentFn: agentFnName },
    )
    handlerDiagnostics.require(
      agentFnHash === undefined || (typeof agentFnHash === 'string' && agentFnHash.length),
      Errors.PRECONDITION_INVALID,
      'agentFn hash must be a non-empty string',
      { field: 'agentFn.hash', component: compName, hash: compHash, agentFn: agentFnName },
    )
    handlerDiagnostics.require(
      !uniqueAgentFnNames.has(agentFnName),
      Errors.PRECONDITION_INVALID,
      `Duplicate agentFn name: ${agentFnName}`,
      { component: compName, hash: compHash, agentFn: agentFnName },
    )
    uniqueAgentFnNames.add(agentFnName)

    const { id: agentFnId } = await createAgentFnVertex({
      g,
      dataMapper,
      agentFn: {
        name: agentFnName,
        portAddr,
        hash: agentFnHash,
        codeRef,
      },
    })
    await createComponentAgentFnEdge({
      g,
      dataMapper,
      fromId: componentVID,
      toId: agentFnId,
    })
  }
}
