# RocketGSM - Registro de Pruebas y Soluciones

## Resumen del Proyecto
Sistema de gestión para taller de reparación con roles de Administrador, Recepción y Técnico. Desarrollado en Node.js, Express, MongoDB y EJS.

## Pruebas Realizadas y Soluciones Implementadas

### 1. Configuración Inicial y Dependencias

#### Problema: Error de PowerShell al instalar dependencias
```
npm : No se puede cargar el archivo ... porque la ejecución de scripts está deshabilitada en este sistema.
```

**Solución:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

#### Problema: Puerto 3000 ocupado
```
Pipe 3000 is already in use
```

**Solución:**
```cmd
taskkill /f /im node.exe
```

### 2. Seguridad y Autenticación

#### Implementaciones de Seguridad:
- **Helmet**: Protección contra XSS, CSP, etc.
- **bcrypt**: Hash de contraseñas con salt rounds configurables
- **express-rate-limit**: Protección contra ataques de fuerza bruta
- **express-validator**: Validación y sanitización de inputs
- **CORS**: Configuración de políticas de origen cruzado
- **express-session**: Gestión segura de sesiones

#### Validación de Contraseñas:
```javascript
// Requisitos implementados:
// - Mínimo 8 caracteres
// - Al menos una mayúscula
// - Al menos una minúscula  
// - Al menos un número
```

### 3. Estructura del Proyecto

#### Refactorización Implementada:
- **Modularización**: Separación de rutas por rol (`/routes/admin.js`, `/routes/recepcion.js`, `/routes/tecnico.js`)
- **Middleware centralizado**: Autenticación, validación, logging
- **Configuración**: Base de datos, logger, variables de entorno
- **Logging estructurado**: Winston para logs de error y combinados

### 4. Gestión de Archivos

#### Problema: Subida de fotos de dispositivos
**Error:** `warn: Validation errors ... Failed to lookup view`

**Solución:**
- Configuración de Multer con límites dinámicos
- Validación de tipos MIME estrictos
- Funciones de limpieza de archivos huérfanos
- Manejo de errores mejorado

### 5. Interfaz de Usuario (EJS)

#### Problema: Items de inventario no aparecían en formulario de cotización
**Error:** `Expression expected.` en sintaxis EJS dentro de JavaScript

**Solución:**
```javascript
// Cambio de:
const inventario = <%- JSON.stringify(inventario) %>;

// A:
<script type="application/json" id="inventario-data">
<%- JSON.stringify(inventario || []) %>
</script>
```

#### Problema: Content Security Policy bloqueando scripts
**Error:** `Refused to execute inline script`

**Solución:**
```javascript
// Configuración de Helmet en app.js
contentSecurityPolicy: {
  directives: {
    scriptSrc: ["'self'", "'unsafe-inline'"],
    scriptSrcAttr: ["'unsafe-inline'"]
  }
}
```

### 6. Variables EJS y Renderizado

#### Problema: `isEdit is not defined` en formularios
**Error:** Variables no pasadas desde rutas GET para formularios de creación

**Solución:**
```javascript
// En rutas GET para formularios nuevos:
res.render('form', { 
  isEdit: false, 
  formData: {}, 
  mainObject: null 
});
```

#### Problema: `formData is not defined`
**Solución:** Pasar objeto vacío `formData: {}` en rutas de creación

### 7. Gestión de Inventario

#### Implementación de Control de Stock:
- **Deducción automática**: Al crear cotización
- **Restauración**: Al rechazar/cancelar cotización
- **Validación**: Stock suficiente antes de crear cotización

```javascript
// Lógica implementada en routes/recepcion.js
// Al crear cotización: decrementar stock
// Al rechazar/cancelar: incrementar stock
```

### 8. Funcionalidades CRUD

#### Admin - Gestión de Usuarios:
- ✅ Crear usuarios
- ✅ Editar usuarios  
- ✅ Cambiar contraseñas
- ✅ Eliminar usuarios (soft delete)

#### Admin - Gestión de Inventario:
- ✅ Crear items
- ✅ Editar items
- ✅ Eliminar items (soft delete)

#### Recepción - Gestión de Clientes:
- ✅ Crear clientes
- ✅ Editar clientes
- ✅ Eliminar clientes

#### Recepción - Gestión de Dispositivos:
- ✅ Crear dispositivos
- ✅ Editar dispositivos
- ✅ Subir/eliminar fotos
- ✅ Eliminar dispositivos

### 9. Flujo de Trabajo del Técnico

#### Problema: Error al acceder a `c.creadoPor._id`
**Error:** `TypeError: Cannot read properties of undefined (reading '_id')`

**Solución:**
```javascript
// Condición robusta en EJS:
<% if (
  c.estado === 'rechazada' &&
  c.creadoPor &&
  (
    (typeof c.creadoPor === 'object' && c.creadoPor !== null && c.creadoPor._id && c.creadoPor._id.toString() === user._id.toString()) ||
    (typeof c.creadoPor === 'string' && c.creadoPor === user._id.toString())
  )
) { %>
```

#### Funcionalidades Implementadas:
- ✅ Ver detalles de orden antes de tomar
- ✅ Tomar orden asignada
- ✅ Crear cotización
- ✅ Editar cotización rechazada
- ✅ Finalizar orden

### 10. Reportes y Facturación

#### Implementado:
- Generación de reportes finales
- Vista de impresión optimizada
- Detalles completos de orden, cliente, dispositivo y cotización

### 11. Validación de Datos

#### Problema: Enums inconsistentes entre modelos y formularios
**Error:** `Tipo de dispositivo inválido`

**Solución:**
```javascript
// Sincronización de enums:
// Dispositivo: ['computadora', 'laptop', 'impresora', 'tablet', 'smartphone', 'monitor', 'otro']
// Inventario: ['repuestos', 'herramientas', 'accesorios', 'otros']
```

### 12. Manejo de Errores

#### Estrategia Implementada:
- **Logging centralizado**: Winston con niveles de error
- **Middleware de error**: Captura de errores no manejados
- **Validación robusta**: Verificación de datos antes de procesar
- **Redirecciones inteligentes**: `res.redirect('back')` en errores de validación

## Resultados Finales

### Funcionalidades Completadas:
- ✅ Sistema de autenticación seguro
- ✅ Gestión completa de usuarios por rol
- ✅ CRUD completo para todas las entidades
- ✅ Control de inventario automático
- ✅ Flujo de trabajo completo (Orden → Cotización → Aprobación → Finalización)
- ✅ Gestión de archivos (fotos de dispositivos)
- ✅ Reportes y facturación
- ✅ Interfaz responsive y moderna

### Métricas de Calidad:
- **Seguridad**: Implementación de mejores prácticas OWASP
- **Usabilidad**: Navegación intuitiva con botones de retorno
- **Mantenibilidad**: Código modular y bien estructurado
- **Escalabilidad**: Arquitectura preparada para crecimiento

### Tecnologías Utilizadas:
- **Backend**: Node.js, Express.js, MongoDB, Mongoose
- **Frontend**: EJS, CSS3, JavaScript
- **Seguridad**: bcrypt, helmet, express-rate-limit, express-validator
- **Logging**: Winston
- **Archivos**: Multer, fs

## Lecciones Aprendidas

1. **Validación temprana**: Es crucial validar datos tanto en frontend como backend
2. **Manejo de errores**: Implementar logging y manejo robusto de excepciones
3. **Seguridad**: No subestimar la importancia de medidas de seguridad básicas
4. **Modularización**: Separar responsabilidades mejora la mantenibilidad
5. **Testing**: Probar cada funcionalidad antes de continuar con la siguiente

## Próximas Mejoras Sugeridas

1. **Testing automatizado**: Implementar Jest o Mocha
2. **API REST**: Separar backend de frontend
3. **Notificaciones**: Sistema de alertas en tiempo real
4. **Backup automático**: Sistema de respaldo de base de datos
5. **Dashboard analítico**: Métricas y reportes avanzados 