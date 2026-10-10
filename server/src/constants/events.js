module.exports = {
  WS_EVENTS: {
    INIT: 'init',
    EDIT_LINE: 'edit_line',
    LINE_UPDATED: 'line_updated',
    EDIT_REJECTED: 'edit_rejected',
    ADD_LINE: 'add_line',
    REMOVE_LINE: 'remove_line',
    LINE_ADDED: 'line_added',
    LINE_REMOVED: 'line_removed',

    SAVE: 'save',             // Client -> Server: "Write this document to disk"
    SAVE_ACK: 'save_ack',     // Server -> Client: "Successfully saved"
    SAVE_ERROR: 'save_error', // Server -> Client: "Write failed"
  },
};