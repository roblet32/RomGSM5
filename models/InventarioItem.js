const mongoose = require('mongoose');

const inventarioItemSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    descripcion: {
        type: String,
        required: false,
        trim: true
    },
    categoria: {
        type: String,
        required: true,
        enum: ['repuestos', 'herramientas', 'accesorios', 'otros'],
        trim: true
    },
    precio: {
        type: Number,
        required: true,
        min: 0
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    stockMinimo: {
        type: Number,
        required: false,
        min: 0,
        default: 1
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Método para verificar si tiene stock disponible
inventarioItemSchema.virtual('disponible').get(function() {
    return this.stock > 0;
});

// Método para verificar si está en stock bajo
inventarioItemSchema.virtual('stockBajo').get(function() {
    return this.stock <= this.stockMinimo;
});

// Asegurar que se incluya en JSON
inventarioItemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('InventarioItem', inventarioItemSchema);