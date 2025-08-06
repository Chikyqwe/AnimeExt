module.exports.isMetadataStale = () =>
  new Date() - new Date(require('../services/jsonService').getMetadata().creado_en) > 24*60*60*1000;
