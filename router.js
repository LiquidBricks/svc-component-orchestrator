import router from "@liquid-bricks/lib-nats-subject/router";
import { Errors } from "./errors.js";
import * as component from './core/component/index.js'
import * as componentInstance from './core/componentInstance/index.js'
import * as data from './core/data/index.js'
import * as gate from './core/gate/index.js'
import * as importEntity from './core/import/index.js'
import * as task from './core/task/index.js'
import { dataMapper as createDataMapper } from '@liquid-bricks/spec-domain/domain'

export function createComponentServiceRouter({
  natsContext,
  g,
  diagnostics,
  dataMapper = createDataMapper({ g, diagnostics }),
}) {
  return router({
    tokens: ['env', 'ns', 'tenant', 'context', 'channel', 'entity', 'action', 'version', 'id'],
    context: { natsContext, g, diagnostics, dataMapper },
  })
    .before(({ rootCtx: { diagnostics }, scope, message }) => {
      // diagnostics.trace('event received', { subject: message.subject, message: message.json() })

      const timer = diagnostics.timer('GENERIC_OPERATION', { subject: message.subject })
      return { timer }
    })
    .after(({ rootCtx: { diagnostics }, scope: { timer }, message }) => {
      // return timer.stop({})
    })

    .beforeEach(({ rootCtx: { diagnostics }, info: { params, values, stage, index, fn }, scope, message }) => {
      const handlerDiagnostics = diagnostics.child({
        router: { params, values, stage, index, fn },
        scope,
        message: message.json(),
      })

      return { handlerDiagnostics }
    })
    .route(component.cmd.register.path, component.cmd.register.spec)
    .route(component.evt.registered.path, component.evt.registered.spec)
    .route(componentInstance.cmd.create.path, componentInstance.cmd.create.spec)
    .route(componentInstance.cmd.start.path, componentInstance.cmd.start.spec)
    .route(componentInstance.cmd.start_dependants.path, componentInstance.cmd.start_dependants.spec)
    .route(data.cmd.start.path, data.cmd.start.spec)
    .route(gate.cmd.start.path, gate.cmd.start.spec)
    .route(importEntity.cmd.start.path, importEntity.cmd.start.spec)
    .route(task.cmd.start.path, task.cmd.start.spec)
    .route(componentInstance.evt.created.path, componentInstance.evt.created.spec)
    .route(componentInstance.evt.result_computed.path, componentInstance.evt.result_computed.spec)
    .route(componentInstance.evt.state_machine_completed.path, componentInstance.evt.state_machine_completed.spec)
    .route(componentInstance.evt.started.path, componentInstance.evt.started.spec)
    .default({
      handler: async ({ message, rootCtx: { diagnostics } }) => {
        diagnostics.invariant(
          message.term(`No handler for subject: ${message.subject}`) ?? false,
          Errors.ROUTER_UNKNOWN_SUBJECT,
          `No handler for subject: ${message.subject}`,
          { subject: message.subject, message: message?.json?.() }
        )
      }
    })
    .error(({ error, rootCtx: { diagnostics } }, ...rest) => {
      if (error instanceof diagnostics.DiagnosticError) {
        return //we already have an error diagnosed, dont throw another one.
      }
      throw diagnostics.error(
        Errors.ROUTER_HANDLER_ERROR,
        'component service router error',
        { error, rest },
      )
    })
    .abort(({ reason, stage, message, rootCtx: { diagnostics } }) => {
      try { message?.ack?.() } catch (_) { /* ignore */ }
      return { status: 'aborted' }
    })
}
