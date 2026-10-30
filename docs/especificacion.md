# Especificación de LAVACRÁN OS (prototipo 1)

Reglas acordadas por el grupo a partir de las funciones aprobadas por el profesor.
Todos los números están en un solo archivo, `js/config.js`: si el profesor pide otros valores, se cambian ahí.

## 1. Decisiones del grupo

| Tema | Decisión |
|---|---|
| Plataforma | Web: HTML, CSS y JavaScript, sin instalar nada. Publicado en GitHub Pages |
| Enfoque | Sistemas Operativos: se muestran interrupciones, planificador de tareas, máquina de estados y memoria no volátil |
| Capacidad | 10,0 kg de ropa seca como máximo general |
| Límites por programa | Sintéticos 5 kg · Delicado 3 kg · Rápido 3 kg · Autolimpieza 0 kg (tambor vacío) |
| Mecanismo | Impulsor en el fondo del tambor |
| Programas | Normal/Algodón, Sintéticos, Delicado, Pesado/Toallas, Rápido, Vapor/Higiene, Enjuague + Centrifugado, Solo centrifugado, Autolimpieza |
| Vapor | Programa propio (Vapor / Higiene) |
| Temperatura | Fría, 30, 40 y 60 °C con resistencia interna; usa el agua caliente de red si está conectada |
| Tapa | Nunca se traba. Abrirla pausa al instante; cerrarla continúa. El vapor se corta en el mismo instante en que se abre |
| Agregar ropa | En cualquier momento. Solo se detiene si se pasa el límite |
| Corte de luz | Hasta 19:59 continúa donde quedó; desde 20:00 desagota y reinicia el programa automáticamente |
| Desbalance real | Sí: hasta 3 intentos de redistribuir; si no se puede, centrifuga a 400 rpm y avisa (E4) |
| Inicio diferido | "Inicia en X horas", de 30 min a 24 h |
| Memoria | 3 favoritos (M1, M2, M3) y recuerda el último programa usado |
| Autolimpieza | Solo con el tambor vacío, agua caliente + vapor, aviso cada 30 lavados |
| Marca | LAVACRÁN, de Alacrán Group. Lavarropas blanco con tapa de vidrio |
| Fallas extra | E1 falta de agua, E2 desagote tapado, E3 sobrecarga, E4 desbalance |

## 2. Valores técnicos

| Parámetro | Valor |
|---|---|
| Niveles de agua | Auto · Bajo 25 L · Medio 40 L · Alto 55 L · Extra 70 L |
| Nivel automático | 20 L + 5 L por kg, entre 25 y 70 L (1 kg → 25 L, 6 kg → 50 L, 10 kg → 70 L) |
| Reposición de agua | Si mientras lava el nivel baja 3 L (la ropa absorbe), vuelve a llenar hasta el objetivo |
| Caudal de entrada / desagote | 15 L/min / 25 L/min |
| Agua fría / caliente de red | 22 °C / 55 °C |
| Resistencia / generador de vapor | 2000 W / 2000 W (vapor hasta 75 °C) |
| Centrifugado | Sin, 400, 600, 800 rpm (sube 60 rpm/s, frena 150 rpm/s); intermedio a 400 rpm |
| Tara (tina + tambor sobre las celdas de carga) | 18 kg |
| Tolerancia del sensor de peso | 0,05 kg (0,3 kg para la autolimpieza) |
| Umbral de vibración | 50 (escala 0 a 100) |
| Tiempo para detectar E1 / E2 | 90 s |
| Guardado en memoria no volátil | cada 5 s, en cada cambio de paso y al detectar la falla de energía |

## 3. Programas

Duraciones medidas con la simulación (agua caliente conectada salvo que se indique).

| Programa | Máx. | Temp. por defecto | Centrif. por defecto | Pasos | Duración |
|---|---|---|---|---|---|
| Normal / Algodón | 10 kg | 30 °C | 800 | lavado 25 min (ajustado por carga), 2 enjuagues, centrifugado 7 min | 57 min con 5 kg · 69 min con 10 kg |
| Sintéticos | 5 kg | 30 °C | 600 | lavado 18 min, 2 enjuagues, centrifugado 5 min | 47 min con 5 kg |
| Delicado | 3 kg | fría | 400 | lavado suave 10 min, 2 enjuagues, centrifugado 4 min | 32 min con 3 kg |
| Pesado / Toallas | 10 kg | 40 °C | 800 | lavado fuerte 32 min, 3 enjuagues, centrifugado 9 min | 96 min con 10 kg |
| Rápido 30 min | 3 kg | fría | 600 | lavado 12 min, 1 enjuague, centrifugado 5 min | 27 min con 3 kg |
| Vapor / Higiene | 10 kg | 40 °C | 800 | lavado 20 min, 12 min de vapor, 2 enjuagues | 80 min con 10 kg |
| Enjuague + Centrifugado | 10 kg | fría | 800 | 1 enjuague, centrifugado 6 min | 18 min |
| Solo centrifugado | 10 kg | — | 800 | desagote, centrifugado 7 min | 8 min |
| Autolimpieza del tambor | vacío | 60 °C | 400 | 70 L a 60 °C, 8 min de vapor, 1 enjuague | 63 min |

Normal a 60 °C con 10 kg: 97 min con agua caliente de red y 187 min sin ella (la resistencia calienta todo desde 22 °C).

## 4. Reglas en detalle

### Sensor de carga y kilaje (funciones 2 y 8)
- Al presionar Inicio, el primer paso es el **pesaje**: 20 s con el tambor quieto. Ropa = peso medido − tara.
- Si la ropa supera el límite del programa por más de 0,05 kg: **E3**, el lavarropas no carga agua y espera.
- Al retirar el exceso (con la tapa abierta) la alarma se apaga y, al cerrar la tapa, sigue solo.
- Con la carga medida se calcula el nivel automático y la duración del lavado: de 70 % (tambor vacío) a 100 % (10 kg).

### Agregar ropa con el lavarropas funcionando
Las celdas de carga miden todo junto: tina + agua + ropa. Para saber cuánta ropa se agregó:
1. Al abrir la tapa el ciclo se pausa y se cierran válvulas y bomba: el agua deja de cambiar.
2. Se guarda el peso en ese instante.
3. Todo lo que aumente mientras la tapa está abierta es ropa nueva: `ropa total = ropa registrada + (peso ahora − peso al abrir)`.
4. Si `ropa total` pasa el límite: **E3** con el exceso en kg ("retire 1,0 kg"). Con la tapa cerrada no continúa.
5. Al bajar del límite y cerrar la tapa, sigue lavando y recalcula el nivel automático (por ejemplo, de 50 a 60 L al pasar de 6 a 8 kg).

Control cruzado, válido antes del primer desagote: `ropa ≈ peso − tara − litros cargados` (1 L de agua ≈ 1 kg). Se ve en la pestaña Sensores.

### Tapa de cierre suave (función 9)
- Nunca se traba, en ninguna fase.
- Abrirla pausa al instante: el motor frena (desde 800 rpm tarda unos 5 s), se cierran válvulas y se apagan bomba, resistencia y vapor.
- Cerrarla continúa el ciclo, salvo que haya sobrecarga.
- El cierre es amortiguado: el interruptor avisa "cerrada" recién cuando la tapa termina de bajar.
- Si el usuario había pausado con Inicio/Pausa, al cerrar la tapa sigue en pausa hasta que presione Inicio.

### Corte de luz
- Al cortarse la luz, la interrupción no enmascarable (NMI) guarda el estado en la memoria no volátil.
- El reloj del sistema tiene batería: al volver la luz se sabe cuánto duró el corte.
- **Hasta 19:59** continúa en el mismo paso y con el mismo avance.
- **Desde 20:00** desagota el agua que quedó y arranca el programa desde cero, con la carga ya medida.
- Si el corte ocurre durante un inicio diferido, la cuenta regresiva sigue. Si la hora pasó durante el corte, arranca al volver la luz.
- Cerrar la pestaña del navegador cuenta como corte: al volver se mide el tiempo real que estuvo cerrada.

### Desbalance
- El acelerómetro dispara la IRQ3 si la vibración supera 50 durante el centrifugado.
- Cada intento: frena, carga 15 L, agita suave 30 s para redistribuir, desagota y vuelve a centrifugar.
- Hasta 3 intentos. Si no se corrige, centrifuga a 400 rpm y muestra **E4**.

### Inicio diferido (función 7)
- Botón Diferido: suma 30 min hasta las 3 h y después de a 1 h hasta 24 h; una vez más vuelve a cero.
- Inicio/Pausa con diferido programado arranca en ese momento. Mantenerlo 2 s cancela el diferido.

### Memoria de programas
- M1, M2, M3: tocar carga; mantener 1,5 s guarda la configuración actual (programa, temperatura, nivel y centrifugado).
- Al encender, queda seleccionado el último programa usado.
- Todo se conserva aunque se corte la luz.

### Autolimpieza (función 6)
- Solo arranca con el tambor vacío (tolerancia de 0,3 kg). Si hay ropa: E3 hasta que se saque.
- Cada 30 lavados terminados, la pantalla recomienda hacerla. Al completarla, el contador vuelve a cero.

### Vapor (función 4)
- Después del lavado y el desagote, el generador lleva el tambor a unos 75 °C durante 12 min mientras el tambor gira despacio.
- Por seguridad, abrir la tapa corta el vapor en el mismo instante (antes de pausar).

### Cancelar
- Mantener Inicio/Pausa 2 s: frena el tambor, desagota y vuelve a reposo. No cuenta como lavado.

## 5. Códigos de error

| Código | Qué pasó | Qué hace el lavarropas | Qué debe hacer el usuario |
|---|---|---|---|
| E1 | Falta de agua: las válvulas abren pero el nivel no sube en 90 s | Se detiene y suena la alarma | Abrir la canilla y presionar Inicio |
| E2 | Desagote tapado: la bomba funciona pero el nivel no baja en 90 s | Se detiene y suena la alarma | Destapar la manguera o el filtro y presionar Inicio |
| E3 | Sobrecarga: la ropa supera el límite del programa | Se detiene sin cargar agua (o pausa si ya lavaba) | Abrir la tapa, sacar ropa y cerrar |
| E4 | Desbalance que no se pudo corregir | Sigue, pero centrifuga a 400 rpm | Al terminar, acomodar la ropa |

## 6. Casos de prueba automáticos

Están en `tests/pruebas.js` y se ven en `pruebas.html`.

| # | Situación | Resultado esperado |
|---|---|---|
| 1 | Cargar 4 kg y arrancar Normal | Detecta 4,0 kg y planifica 40 L |
| 2 | Nivel automático con 1, 6 y 10 kg | 25, 50 y 70 L |
| 3 | Lavar 2 kg y 10 kg | El lavado de 2 kg es más corto |
| 4 | Lavar 8 kg | Repone agua mientras lava |
| 5 | Arrancar con 10,5 kg | E3, no carga agua; al sacar 0,5 kg sigue solo |
| 6 | 3,5 kg en Rápido / 2,9 kg en Rápido | E3 con límite 3 kg / arranca |
| 7 | Agregar 2 kg a 6 kg en pleno lavado | Sigue, 8 kg registrados, nivel sube a 60 L |
| 8 | Agregar 2 kg a 9 kg en pleno lavado | E3 con exceso de 1 kg, no sigue con la tapa cerrada; al sacar 1 kg continúa |
| 9 | Abrir la tapa lavando | Pausa al instante, válvulas y motor apagados; al cerrar sigue |
| 10 | Abrir la tapa a 800 rpm | Se abre, frena en menos de 6 s; al cerrar vuelve a acelerar |
| 11 | Pausa del usuario + abrir y cerrar la tapa | Sigue en pausa hasta presionar Inicio |
| 12 | Corte de 19:59 | Continúa en el mismo paso y con el mismo avance |
| 13 | Corte de 20:00 | Desagota y reinicia el programa con la carga medida |
| 14 | Corte de 15 min durante un diferido de 60 min | Quedan 35 min de espera |
| 15 | Cerrar la página 5 min / 25 min | Continúa / reinicia |
| 16 | Diferido de 30 min | No arranca a los 29:50, arranca a los 30:00 |
| 17 | Guardar en M1 y cargarlo | Recupera programa y temperatura; al encender recuerda el último |
| 18 | Cambiar el centrifugado lavando | El final usa la nueva velocidad |
| 19 | Rápido con 3 kg | Termina en 30 min o menos |
| 20 | Abrir la tapa en la fase de vapor | El vapor se apaga en el mismo instante |
| 21 | Autolimpieza con ropa / vacía / contador | E3 / arranca / el contador vuelve a 0 |
| 22 | Desbalance que se corrige | Redistribuye y llega a 800 rpm sin E4 |
| 23 | Desbalance que no se corrige | 3 intentos, E4 y 400 rpm |
| 24 | Canilla cerrada | E1; al abrirla y presionar Inicio sigue |
| 25 | Desagote tapado | E2; al destaparlo y presionar Inicio sigue |
| 26 | 60 °C sin agua caliente | Calienta con la resistencia hasta 60 °C |
| 27 | 40 °C con agua caliente | Llega casi sin usar la resistencia |
| 28 | Pausar, reanudar y cancelar | Pausa, sigue, y al cancelar desagota y vuelve a reposo |
| 29 | Programa Normal completo con 6 kg | Termina entre 45 y 90 min, sin agua y cuenta un lavado |
| 30 | Apagar con un programa en marcha | No se apaga |
