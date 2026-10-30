# Guía para trabajar con Git y GitHub

Cada pareja tiene su **rama**. Nadie trabaja directo en `main`: los cambios llegan a `main` por **Pull Request** y Angel (integrador) los revisa.

| Pareja | Rama |
|---|---|
| 1 · Angel Vázquez y Aldo Riveros | `pareja-1-panel` |
| 2 · Abdias Ruiz y Sergio Chamorro | `pareja-2-sensores` |
| 3 · Angel Patiño y Richard Peralta | `pareja-3-nucleo` |
| 4 · Thiago Lovera y Miqueas Oliva | `pareja-4-seguridad` |
| 5 · Pedro González y Alma Cáceres | `pareja-5-animacion` |

## Antes de empezar (una sola vez)

1. Crear una cuenta en https://github.com y pasarle el usuario a Angel.
2. Angel entra al repositorio, **Settings → Collaborators → Add people** y agrega a cada uno.
3. Cada uno acepta la invitación que le llega por correo.
4. Instalar Git (https://git-scm.com) o, si prefieren no usar la terminal, GitHub Desktop (https://desktop.github.com).

## Con la terminal

### Descargar el proyecto (una sola vez)
```bash
git clone https://github.com/Angelitot/Proyecto-de-Lavarropas---Sistema-Operativo.git
cd Proyecto-de-Lavarropas---Sistema-Operativo
git config user.name "Tu Nombre"
git config user.email "tu-correo@ejemplo.com"
```

### Cada vez que se ponen a trabajar
```bash
git switch pareja-2-sensores        # su rama
git pull origin main                # traer lo último que se aceptó en main
```

### Guardar y subir cambios
```bash
git status                          # ver qué archivos cambiaron
git add .
git commit -m "Sensores: filtro de mediana para el peso"
git push
```

Mensajes de commit: empiecen con el módulo y digan qué cambió ("Panel: hora de fin en el diferido").

### Pedir que se acepten los cambios (Pull Request)
1. Entrar al repositorio en GitHub. Aparece el aviso **Compare & pull request** de su rama.
2. Base: `main`. Compare: su rama.
3. Describir qué cambiaron y cómo lo probaron.
4. Angel revisa, comenta si hace falta y hace **Merge**.

## Con GitHub Desktop
1. **File → Clone repository** y elegir `Proyecto-de-Lavarropas---Sistema-Operativo`.
2. Arriba, en **Current branch**, elegir la rama de la pareja.
3. **Fetch origin** y después **Branch → Update from main** para traer lo último.
4. Hacer los cambios. Escribir el resumen abajo a la izquierda y **Commit to pareja-...**.
5. **Push origin**.
6. **Create Pull Request** (abre GitHub en el navegador).

## Reglas del grupo
- Antes de cada Pull Request: abrir `pruebas.html` y confirmar que todas las pruebas pasan.
- Cada pareja toca sus archivos. Si necesitan cambiar el archivo de otra pareja, lo hablan antes.
- Los valores técnicos (litros, rpm, tiempos) se cambian solo en `js/config.js` y hay que avisar al grupo.
- Si `git pull` dice que hay un **conflicto**, abran el archivo, busquen las marcas `<<<<<<<` y `>>>>>>>`, dejen la versión correcta, y después `git add .` y `git commit`.

## Ver el simulador publicado
GitHub Pages publica automáticamente lo que está en `main`:
https://angelitot.github.io/Proyecto-de-Lavarropas---Sistema-Operativo/
Después de un merge tarda uno o dos minutos en actualizarse.
