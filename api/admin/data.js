const { handleNodeRequest } = require("../../lib/admin-api");

module.exports = (req, res) => handleNodeRequest(req, res, "data");
