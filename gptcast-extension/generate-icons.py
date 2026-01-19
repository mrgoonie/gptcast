"""
Generate GPTCast placeholder icons
Creates simple gradient icons with microphone/podcast motif
"""
from PIL import Image, ImageDraw
import math
import os

def create_gradient_icon(size):
    """Create a gradient icon with microphone/speech bubble motif"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Create gradient background (purple to indigo)
    for y in range(size):
        # Gradient from #6366f1 (99, 102, 241) to #4338ca (67, 56, 202)
        ratio = y / size
        r = int(99 + (67 - 99) * ratio)
        g = int(102 + (56 - 102) * ratio)
        b = int(241 + (202 - 241) * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Draw rounded corners by masking
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = size // 5
    mask_draw.rounded_rectangle([(0, 0), (size-1, size-1)], radius=radius, fill=255)

    # Apply mask
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(img, (0, 0), mask)

    # Draw microphone icon (white)
    draw = ImageDraw.Draw(result)

    # Microphone head (oval)
    mic_center_x = size // 2
    mic_center_y = size * 0.35
    mic_width = size * 0.25
    mic_height = size * 0.3

    draw.ellipse([
        mic_center_x - mic_width/2,
        mic_center_y - mic_height/2,
        mic_center_x + mic_width/2,
        mic_center_y + mic_height/2
    ], fill='white')

    # Microphone stand (arc below)
    arc_y = mic_center_y + mic_height/2 - size*0.05
    arc_width = mic_width * 1.3
    arc_height = size * 0.2

    # Draw arc using lines
    draw.arc([
        mic_center_x - arc_width/2,
        arc_y,
        mic_center_x + arc_width/2,
        arc_y + arc_height*2
    ], start=0, end=180, fill='white', width=max(2, size//20))

    # Microphone pole
    pole_width = max(2, size // 20)
    draw.rectangle([
        mic_center_x - pole_width/2,
        arc_y + arc_height,
        mic_center_x + pole_width/2,
        size * 0.75
    ], fill='white')

    # Microphone base
    base_width = size * 0.2
    draw.rectangle([
        mic_center_x - base_width/2,
        size * 0.73,
        mic_center_x + base_width/2,
        size * 0.78
    ], fill='white')

    # Add speech bubble indicator (small arc on right)
    bubble_x = mic_center_x + size * 0.25
    bubble_y = mic_center_y - size * 0.1
    bubble_r = size * 0.12

    draw.ellipse([
        bubble_x - bubble_r,
        bubble_y - bubble_r,
        bubble_x + bubble_r,
        bubble_y + bubble_r
    ], fill='white')

    return result

def main():
    sizes = [16, 32, 48, 128]
    output_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(output_dir, 'assets', 'icons')

    os.makedirs(icons_dir, exist_ok=True)

    for size in sizes:
        icon = create_gradient_icon(size)
        path = os.path.join(icons_dir, f'icon-{size}.png')
        icon.save(path, 'PNG')
        print(f'Created: {path}')

if __name__ == '__main__':
    main()
