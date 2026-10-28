/** The renderer's only door to the main process: `window.pdoc` (no Node in the page). */
import { contextBridge, ipcRenderer } from "electron";
import type { PDocApi } from "../shared/api.ts";

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`pdoc:${channel}`, ...args);
const send =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.send(`pdoc:${channel}`, ...args);
const listen = (channel: string, cb: (...args: never[]) => void) => {
  const fn = (_e: unknown, ...args: unknown[]) => (cb as (...a: unknown[]) => void)(...args);
  ipcRenderer.on(`pdoc:${channel}`, fn);
  return () => void ipcRenderer.off(`pdoc:${channel}`, fn);
};

const api: PDocApi = {
  settings: { get: call("settings:get"), set: call("settings:set") } as PDocApi["settings"],
  library: {
    info: call("library:info"),
    setupOffline: call("library:setupOffline"),
    list: call("library:list"),
    create: call("library:create"),
    open: call("library:open"),
    save: call("library:save"),
    rename: call("library:rename"),
    copy: call("library:copy"),
    remove: call("library:remove"),
    restore: call("library:restore"),
    move: call("library:move"),
    showInFolder: call("library:showInFolder"),
    showRoot: call("library:showRoot"),
  } as PDocApi["library"],
  recovery: { put: send("recovery:put"), clear: send("recovery:clear"), take: call("recovery:take") } as PDocApi["recovery"],
  app: {
    onClosing: (cb) => listen("closing", cb),
    closeReady: send("app:closeReady"),
    toggleFullScreen: call("app:toggleFullScreen"),
    onFullScreen: (cb) => listen("fullscreen", cb),
    setTitleBar: send("app:setTitleBar"),
    openExternal: call("app:openExternal"),
    openLogs: call("app:openLogs"),
    version: call("app:version"),
    config: call("app:config"),
    edit: send("app:edit"),
    quit: send("app:quit"),
  } as PDocApi["app"],
};

contextBridge.exposeInMainWorld("pdoc", api);
