"""
Generador de iconos oficiales de TaxiHUB para Android (Launcher, Round y Adaptive Foreground)
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(BASE_DIR, "frontend", "android", "app", "src", "main", "res")

MIPMAP_SIZES = {
    "mipmap-mdpi": {"icon": 48, "fg": 108},
    "mipmap-hdpi": {"icon": 72, "fg": 162},
    "mipmap-xhdpi": {"icon": 96, "fg": 216},
    "mipmap-xxhdpi": {"icon": 144, "fg": 324},
    "mipmap-xxxhdpi": {"icon": 192, "fg": 432},
}

def create_master_icon(size=1024, is_foreground_only=False, is_round=False):
    """Crea el icono maestro de alta definición (1024x1024) de TaxiHUB."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2

    if not is_foreground_only:
        # Fondo oscuro obsidiana (#0A0F1D) con gradiente radial sutil esmeralda
        if is_round:
            # Máscara circular
            mask = Image.new("L", (size, size), 0)
            m_draw = ImageDraw.Draw(mask)
            m_draw.ellipse((16, 16, size - 16, size - 16), fill=255)

            # Fondo circular con borde esmeralda
            draw.ellipse((16, 16, size - 16, size - 16), fill=(11, 17, 30, 255), outline=(16, 185, 129, 255), width=18)
        else:
            # Cuadrado con esquinas suaves (squircle 22%)
            r = int(size * 0.22)
            draw.rounded_rectangle((16, 16, size - 16, size - 16), radius=r, fill=(11, 17, 30, 255), outline=(16, 185, 129, 255), width=18)

        # Resplandor esmeralda central
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        g_draw = ImageDraw.Draw(glow)
        g_draw.ellipse((cx - 320, cy - 320, cx + 320, cy + 320), fill=(16, 185, 129, 45))
        glow = glow.filter(ImageFilter.GaussianBlur(80))
        img = Image.alpha_composite(img, glow)
        draw = ImageDraw.Draw(img)

    # Coordenadas relativas del taxi (centrado horizontalmente)
    # Si es foreground para adaptive icon, la zona segura es el 66% central (radio ~ 340px)
    scale = 0.72 if is_foreground_only else 0.88
    car_cy = cy - 35 * scale

    # 1. Copete / Letrero de TAXI en el techo
    taxi_sign_w = int(220 * scale)
    taxi_sign_h = int(68 * scale)
    sign_top = car_cy - int(240 * scale)
    draw.rounded_rectangle(
        (cx - taxi_sign_w / 2, sign_top, cx + taxi_sign_w / 2, sign_top + taxi_sign_h),
        radius=int(14 * scale),
        fill=(16, 185, 129, 255),  # Esmeralda TaxiHUB
        outline=(5, 150, 105, 255),
        width=int(5 * scale)
    )
    # Base del copete
    draw.rectangle(
        (cx - int(70 * scale), sign_top + taxi_sign_h, cx + int(70 * scale), sign_top + taxi_sign_h + int(14 * scale)),
        fill=(30, 41, 59, 255)
    )

    # Texto 'TAXI' en el copete
    try:
        # Cargar fuente sans-serif si disponible
        font_sign = ImageFont.truetype("arialbd.ttf", int(38 * scale))
    except Exception:
        font_sign = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "TAXI", font=font_sign)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw / 2, sign_top + (taxi_sign_h - th) / 2 - 2), "TAXI", fill=(255, 255, 255, 255), font=font_sign)

    # 2. Techo y parabrisas (cabina del taxi)
    roof_w = int(360 * scale)
    windshield_top = sign_top + taxi_sign_h + int(14 * scale)
    hood_top = car_cy - int(40 * scale)
    body_w = int(580 * scale)

    # Silueta de cabina
    cabina_pts = [
        (cx - roof_w / 2, windshield_top),
        (cx + roof_w / 2, windshield_top),
        (cx + body_w / 2 - int(30 * scale), hood_top),
        (cx - body_w / 2 + int(30 * scale), hood_top),
    ]
    draw.polygon(cabina_pts, fill=(15, 23, 42, 255), outline=(16, 185, 129, 255))

    # Cristal del parabrisas
    glass_pts = [
        (cx - roof_w / 2 + int(24 * scale), windshield_top + int(14 * scale)),
        (cx + roof_w / 2 - int(24 * scale), windshield_top + int(14 * scale)),
        (cx + body_w / 2 - int(60 * scale), hood_top - int(12 * scale)),
        (cx - body_w / 2 + int(60 * scale), hood_top - int(12 * scale)),
    ]
    draw.polygon(glass_pts, fill=(56, 189, 248, 220))  # Azul cielo cristal

    # 3. Carrocería frontal del taxi
    body_bottom = car_cy + int(130 * scale)
    draw.rounded_rectangle(
        (cx - body_w / 2, hood_top - int(5 * scale), cx + body_w / 2, body_bottom),
        radius=int(36 * scale),
        fill=(16, 185, 129, 255),  # Esmeralda TaxiHUB
        outline=(255, 255, 255, 230),
        width=int(6 * scale)
    )

    # Parrilla central deportiva
    grille_w = int(300 * scale)
    grille_h = int(60 * scale)
    grille_top = car_cy + int(40 * scale)
    draw.rounded_rectangle(
        (cx - grille_w / 2, grille_top, cx + grille_w / 2, grille_top + grille_h),
        radius=int(16 * scale),
        fill=(11, 17, 30, 255),
        outline=(52, 211, 153, 255),
        width=int(4 * scale)
    )

    # Faros LED frontales (izquierdo y derecho)
    headlight_w = int(95 * scale)
    headlight_h = int(44 * scale)
    hl_y = car_cy + int(8 * scale)
    # Faro izquierdo
    draw.rounded_rectangle(
        (cx - body_w / 2 + int(35 * scale), hl_y, cx - body_w / 2 + int(35 * scale) + headlight_w, hl_y + headlight_h),
        radius=int(14 * scale),
        fill=(255, 255, 255, 255),
        outline=(56, 189, 248, 255),
        width=int(4 * scale)
    )
    # Faro derecho
    draw.rounded_rectangle(
        (cx + body_w / 2 - int(35 * scale) - headlight_w, hl_y, cx + body_w / 2 - int(35 * scale), hl_y + headlight_h),
        radius=int(14 * scale),
        fill=(255, 255, 255, 255),
        outline=(56, 189, 248, 255),
        width=int(4 * scale)
    )

    # Neumáticos / sombra inferior
    tire_w = int(65 * scale)
    tire_h = int(36 * scale)
    draw.rounded_rectangle((cx - body_w / 2 + int(20 * scale), body_bottom - int(12 * scale), cx - body_w / 2 + int(20 * scale) + tire_w, body_bottom + tire_h), radius=int(10 * scale), fill=(15, 23, 42, 255))
    draw.rounded_rectangle((cx + body_w / 2 - int(20 * scale) - tire_w, body_bottom - int(12 * scale), cx + body_w / 2 - int(20 * scale), body_bottom + tire_h), radius=int(10 * scale), fill=(15, 23, 42, 255))

    # 4. Tipografía "taxiHUB" en la parte inferior
    text_y = car_cy + int(200 * scale)
    try:
        font_main = ImageFont.truetype("arialbd.ttf", int(108 * scale))
    except Exception:
        font_main = ImageFont.load_default()

    # Medir "taxi" y "HUB"
    bb_taxi = draw.textbbox((0, 0), "taxi", font=font_main)
    bb_hub = draw.textbbox((0, 0), "HUB", font=font_main)
    w_taxi = bb_taxi[2] - bb_taxi[0]
    w_hub = bb_hub[2] - bb_hub[0]
    total_w = w_taxi + w_hub + int(10 * scale)
    start_x = cx - total_w / 2

    # "taxi" en blanco limpio
    draw.text((start_x, text_y), "taxi", fill=(255, 255, 255, 255), font=font_main)
    # "HUB" en esmeralda vibrante (#10B981)
    draw.text((start_x + w_taxi + int(10 * scale), text_y), "HUB", fill=(16, 185, 129, 255), font=font_main)

    # Subtítulo pequeño "CHOFER"
    try:
        font_sub = ImageFont.truetype("arialbd.ttf", int(32 * scale))
        bb_sub = draw.textbbox((0, 0), "CHOFER", font=font_sub)
        w_sub = bb_sub[2] - bb_sub[0]
        sub_y = text_y + int(115 * scale)
        draw.text((cx - w_sub / 2, sub_y), "CHOFER", fill=(148, 163, 184, 255), font=font_sub)
    except Exception:
        pass

    return img

def main():
    print("Generando iconos maestros oficiales de TaxiHUB...")
    master_square = create_master_icon(size=1024, is_foreground_only=False, is_round=False)
    master_round = create_master_icon(size=1024, is_foreground_only=False, is_round=True)
    master_fg = create_master_icon(size=1024, is_foreground_only=True, is_round=False)

    for mipmap_name, sizes in MIPMAP_SIZES.items():
        dir_path = os.path.join(RES_DIR, mipmap_name)
        os.makedirs(dir_path, exist_ok=True)

        icon_sz = sizes["icon"]
        fg_sz = sizes["fg"]

        # 1. ic_launcher.png
        icon_img = master_square.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        icon_path = os.path.join(dir_path, "ic_launcher.png")
        icon_img.save(icon_path, format="PNG", optimize=True)

        # 2. ic_launcher_round.png
        round_img = master_round.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        round_path = os.path.join(dir_path, "ic_launcher_round.png")
        round_img.save(round_path, format="PNG", optimize=True)

        # 3. ic_launcher_foreground.png
        fg_img = master_fg.resize((fg_sz, fg_sz), Image.Resampling.LANCZOS)
        fg_path = os.path.join(dir_path, "ic_launcher_foreground.png")
        fg_img.save(fg_path, format="PNG", optimize=True)

        print(f" -> {mipmap_name}: ic_launcher ({icon_sz}px), ic_launcher_round ({icon_sz}px), foreground ({fg_sz}px)")

    # Actualizar color de fondo para Adaptive Icon en values
    bg_xml_path = os.path.join(RES_DIR, "values", "ic_launcher_background.xml")
    os.makedirs(os.path.dirname(bg_xml_path), exist_ok=True)
    with open(bg_xml_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B111E</color>\n</resources>\n')

    # Guardar copia en public/assets/icons/taxihub-app-icon.png
    public_icon = os.path.join(BASE_DIR, "frontend", "public", "assets", "icons", "taxihub-app-icon.png")
    os.makedirs(os.path.dirname(public_icon), exist_ok=True)
    master_square.resize((512, 512), Image.Resampling.LANCZOS).save(public_icon, format="PNG")

    print("\nIconos de TaxiHUB para Android generados y guardados con éxito!")

if __name__ == "__main__":
    main()
