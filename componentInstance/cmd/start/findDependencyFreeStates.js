import { domain } from '@liquid-bricks/spec-domain/domain'

export async function findDependencyFreeStates({ rootCtx: { g }, scope: { stateMachineId } }) {
  return {
    dataStateIds: await g
      .V(stateMachineId)
      .outE(domain.edge.has_data_state.stateMachine_data.constants.LABEL)
      .filter(_ => _.inV().not(__ => __.out(
        domain.edge.has_dependency.data_task.constants.LABEL,
        domain.edge.has_dependency.data_data.constants.LABEL,
        domain.edge.has_dependency.data_deferred.constants.LABEL,
        domain.edge.has_dependency.data_service.constants.LABEL,
      )))
      .id(),
    taskStateIds: await g
      .V(stateMachineId)
      .outE(domain.edge.has_task_state.stateMachine_task.constants.LABEL)
      .filter(_ => _.inV().not(__ => __.out(
        domain.edge.has_dependency.task_task.constants.LABEL,
        domain.edge.has_dependency.task_data.constants.LABEL,
        domain.edge.has_dependency.task_deferred.constants.LABEL,
        domain.edge.has_dependency.task_service.constants.LABEL,
      )))
      .id(),
    serviceStateIds: await g
      .V(stateMachineId)
      .outE(domain.edge.has_service_state.stateMachine_service.constants.LABEL)
      .filter(_ => _.inV().not(__ => __.out(
        domain.edge.has_dependency.service_task.constants.LABEL,
        domain.edge.has_dependency.service_data.constants.LABEL,
        domain.edge.has_dependency.service_service.constants.LABEL,
      )))
      .id(),
  }
}
