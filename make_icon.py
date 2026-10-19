from PIL import Image, ImageDraw, ImageFont
import math

S = 512
im = Image.new("RGB", (S, S), "#080d20")
p = im.load()

# Deep navy background with subtle blue glow
for y in range(S):
    for x in range(S):
        d = math.sqrt((x-256)**2 + (y-220)**2)
        glow = max(0, 1-d/390)
        p[x, y] = (8, int(13+glow*9), int(32+glow*35))

d = ImageDraw.Draw(im, "RGBA")

# Glowing orbital rings
d.ellipse((63, 90, 449, 390), outline=(32, 190, 255, 90), width=5)
d.ellipse((87, 75, 425, 405), outline=(72, 120, 255, 110), width=3)

# Earth globe
d.ellipse((116, 103, 396, 383), fill=(10, 87, 175, 255),
          outline=(90, 235, 255, 255), width=6)

# Globe glow highlights
d.arc((128, 115, 384, 371), 205, 325, fill=(85, 240, 255, 255), width=5)
d.arc((145, 132, 367, 354), 40, 145, fill=(35, 170, 255, 255), width=4)

# Latitude and longitude lines
d.arc((132, 174, 380, 312), 0, 360, fill=(100, 220, 255, 190), width=3)
d.arc((132, 220, 380, 270), 0, 360, fill=(100, 220, 255, 190), width=3)
d.ellipse((188, 107, 324, 379), outline=(100, 220, 255, 190), width=3)
d.ellipse((151, 107, 361, 379), outline=(100, 220, 255, 150), width=3)

# Simple glowing continents
d.polygon([(178,160),(208,144),(233,155),(227,179),(246,194),
           (227,215),(214,245),(194,231),(183,203),(162,187)],
          fill=(50, 226, 190, 230))
d.polygon([(270,157),(299,151),(327,174),(317,196),(337,211),
           (315,230),(300,258),(279,245),(267,217),(246,196)],
          fill=(50, 226, 190, 230))
d.polygon([(230,254),(254,266),(263,296),(250,323),(238,304),
          (222,280)], fill=(50, 226, 190, 230))

# Bright star
d.ellipse((374, 68, 402, 96), fill=(255, 255, 255, 255))
d.line((388, 54, 388, 110), fill=(120, 245, 255, 255), width=4)
d.line((360, 82, 416, 82), fill=(120, 245, 255, 255), width=4)

# Orbit highlights
d.ellipse((72, 226, 91, 245), fill=(110, 245, 255, 255))
d.ellipse((421, 258, 440, 277), fill=(110, 245, 255, 255))

# App name
try:
    font = ImageFont.truetype("/system/fonts/Roboto-Bold.ttf", 43)
except OSError:
    font = ImageFont.load_default()

text = "NEXORA"
box = d.textbbox((0, 0), text, font=font, stroke_width=0)
tw = box[2] - box[0]
d.text(((S-tw)//2, 421), text, font=font, fill=(235, 250, 255, 255),
       stroke_width=1, stroke_fill=(40, 190, 255, 255))

im.save("icon.png")
print("NEXORA icon created: icon.png")
