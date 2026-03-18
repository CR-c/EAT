import { EventEmitter } from "node:events";

export class TaskEventBus {
  constructor() {
    this.emitter = new EventEmitter();
  }

  publish(taskId, eventName, data) {
    this.emitter.emit(this.#key(taskId), {
      data,
      eventName,
    });
  }

  subscribe(taskId, listener) {
    const key = this.#key(taskId);
    this.emitter.on(key, listener);

    return () => {
      this.emitter.off(key, listener);
    };
  }

  #key(taskId) {
    return `task:${taskId}`;
  }
}
