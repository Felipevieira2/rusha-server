const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const betTypesSchema = new Schema({
    active: {
        type: Boolean
    },
    cost: {
        type: Number
    },
    description: {
        type: Date
    },
      id: {
        type: Number
    },
    order: {
        type: Number
    },
      points_lost: {
        type: Number
    },
    points_win: {
        type: Number
    },
    type: {
        type: String
    },
    
});

const BetTypes = mongoose.model('BetTypes', betTypesSchema);

module.exports = BetTypes;