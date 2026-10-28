// Word data model (as needed by the clone). Inferred from documentation.
export interface Section { breakType: 'nextPage' | 'continuous' | 'evenPage' | 'oddPage'; orientation: 'portrait' | 'landscape'; header?: string; footer?: string; linkToPrevious: boolean }
export interface Revision { id: string; kind: 'insert' | 'delete' | 'format'; author: string; date: string }
