import { Errors } from '../../../../../errors.js'

const AGENT_FN_VERTEX_LABEL = 'domain.vertex.agentFn'
const HAS_AGENT_FN_EDGE_LABEL = 'domain.edge.has_agentFn.component__agentFn'

async function createAgentFnVertex({ g, dataMapper, agentFn }) {
  const createAgentFn = dataMapper?.vertex?.agentFn?.create
  if (typeof createAgentFn === 'function') {
    return createAgentFn(agentFn)
  }

  const { name, portAddr, hash, codeRef } = agentFn
  const now = new Date().toISOString()
  let vertex = g
    .addV(AGENT_FN_VERTEX_LABEL)
    .property('name', name)
    .property('portAddr', portAddr)
    .property('createdAt', now)
    .property('updatedAt', now)

  if (hash !== undefined) {
    vertex = vertex.property('hash', hash)
  }

  if (codeRef) {
    const { file, line, column } = codeRef
    vertex = vertex.property('codeRef', { file, line, column })
  }

  const [id] = await vertex.id()
  return { id }
}

async function createComponentAgentFnEdge({ g, dataMapper, fromId, toId }) {
  const createComponentAgentFn = dataMapper?.edge?.has_agentFn?.component_agentFn?.create
  if (typeof createComponentAgentFn === 'function') {
    return createComponentAgentFn({ fromId, toId })
  }

  const now = new Date().toISOString()
  await g
    .addE(HAS_AGENT_FN_EDGE_LABEL, fromId, toId)
    .property('createdAt', now)
    .property('updatedAt', now)
}

export async function attachComponentAgentFns({
  rootCtx: { g, dataMapper },
  scope: { handlerDiagnostics, component, componentVID },
}) {
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
