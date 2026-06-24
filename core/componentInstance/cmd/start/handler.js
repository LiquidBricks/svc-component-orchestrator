export async function handler({ rootCtx: { g, dataMapper }, scope: { stateMachineId } }) {
  await dataMapper.vertex.stateMachine.setRunning({ stateMachineId })
}
