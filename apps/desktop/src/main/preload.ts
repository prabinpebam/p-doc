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
  output: { pdf: call("output:pdf"), print: call("output:print"), showFile: call("output:showFile") } as PDocApi["output"],
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
  versions: {
    list: call("versions:list"),
    at: call("versions:at"),
    name: call("versions:name"),
    restore: call("versions:restore"),
    copy: call("versions:copy"),
    commitNow: call("versions:commitNow"),
    onChanged: (cb) => listen("versions", cb),
  } as PDocApi["versions"],
  github: {
    gitCheck: call("github:gitCheck"),
    status: call("github:status"),
    signInWithToken: call("github:signInWithToken"),
    signInWithBrowser: call("github:signInWithBrowser"),
    cancelSignIn: send("github:cancelSignIn"),
    onSignInProgress: (cb) => listen("signInProgress", cb),
    forget: call("github:forget"),
    gitIdentity: call("github:gitIdentity"),
    plan: call("github:plan"),
    setup: call("github:setup"),
    onSetupProgress: (cb) => listen("setupProgress", cb),
    signOut: call("github:signOut"),
  } as PDocApi["github"],
  sync: { status: call("sync:status"), now: call("sync:now"), onChanged: (cb) => listen("sync", cb) } as PDocApi["sync"],
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
