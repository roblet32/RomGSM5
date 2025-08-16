require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const logger = require('../config/logger');

const createAdminUser = async () => {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        logger.info('Connected to MongoDB');

        // Verificar si ya existe un usuario admin
        const existingAdmin = await User.findOne({ role: 'admin', activo: true });
        
        if (existingAdmin) {
            logger.info('Admin user already exists', { username: existingAdmin.username });
            console.log('✅ Usuario administrador ya existe:', existingAdmin.username);
            process.exit(0);
        }

        // Crear usuario administrador
        const adminUser = new User({
            username: 'admin',
            password: 'Admin123!', // Se hasheará automáticamente
            role: 'admin',
            nombre: 'Administrador',
            email: 'admin@rocketgsm.com',
            activo: true,
            permissions: [
                'user_management',
                'inventory_management',
                'system_configuration',
                'reports_access'
            ]
        });

        await adminUser.save();

        logger.info('Admin user created successfully', { username: adminUser.username });
        console.log('✅ Usuario administrador creado exitosamente!');
        console.log('📧 Username: admin');
        console.log('🔑 Password: Admin123!');
        console.log('⚠️  IMPORTANTE: Cambia la contraseña después del primer login');

    } catch (error) {
        logger.error('Error creating admin user', { error: error.message });
        console.error('❌ Error creando usuario administrador:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    createAdminUser();
}

module.exports = createAdminUser; 