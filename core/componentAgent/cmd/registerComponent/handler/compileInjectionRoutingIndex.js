import { Errors } from '../../../../../errors.js'

export async function compileInjectionRoutingIndex({
  rootCtx: { dataMapper },
  scope: { componentVID, handlerDiagnostics },
}) {
  try {
    const index = dataMapper.vertex.component.index.injectionRouting
    await index.compile({ componentId: componentVID })
    return { componentInjectionRoutingIndexed: true }
  } catch (error) {
    handlerDiagnostics.warn(
      false,
      Errors.COMPONENT_INDEX_BUILD_FAILED,
      'Unable to compile component injection routing index',
      { componentId: componentVID, error },
    )
    return {
      componentInjectionRoutingIndexed: false,
      componentInjectionRoutingReason: 'compile_failed',
    }
  }
}
