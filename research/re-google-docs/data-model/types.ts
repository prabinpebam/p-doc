// Google Docs data model (as needed by the clone). Inferred from documented behaviour.
export interface Document { id: string; title: string; tabs: Tab[]; pageSetup: PageSetup; namedVersions: Version[] }
export interface Tab { id: string; title: string; body: unknown }
export interface PageSetup { format: 'pages' | 'pageless'; orientation: 'portrait' | 'landscape'; paper: string; margins: [number, number, number, number]; pageColor: string }
export interface Version { id: string; name?: string; createdAt: string }
export interface Comment { id: string; anchor: string; body: string; resolved: boolean; replies: Comment[] }
export interface Suggestion { id: string; kind: 'insert' | 'delete' | 'format'; author: string }
