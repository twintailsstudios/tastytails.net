# -*- coding: utf-8 -*-
import os
import sys
import zlib
import struct
import argparse

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CLIENT_ASSETS = os.path.join(PROJECT_ROOT, 'src', 'client', 'assets')

CATEGORY_DIRECTORIES = {
    'flora': os.path.join(CLIENT_ASSETS, 'images', 'flora'),
    'tilemaps': os.path.join(CLIENT_ASSETS, 'tilemaps'),
    'images': os.path.join(CLIENT_ASSETS, 'images'),
    'items': os.path.join(CLIENT_ASSETS, 'tilemaps'),
    'avatar': os.path.join(CLIENT_ASSETS, 'avatar'),
    'clothes': os.path.join(CLIENT_ASSETS, 'clothes'),
    'emotes': os.path.join(CLIENT_ASSETS, 'emotes'),
}

def hex_to_rgba(hex_code, alpha=255):
    hex_clean = hex_code.lstrip('#')
    if len(hex_clean) == 8:
        return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16), int(hex_clean[6:8], 16))
    elif len(hex_clean) == 6:
        return (int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16), alpha)
    return (0, 0, 0, 0)

def write_png_rgba(width, height, pixel_grid, output_filepath):
    raw_scanlines = bytearray()
    for y in range(height):
        raw_scanlines.append(0)
        for x in range(width):
            r, g, b, a = pixel_grid[y][x]
            raw_scanlines.extend([r & 0xFF, g & 0xFF, b & 0xFF, a & 0xFF])
    compressed_idat = zlib.compress(bytes(raw_scanlines), level=9)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed_idat)
    png_bytes = bytearray([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    png_bytes.extend(struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    png_bytes.extend(struct.pack('>I', len(compressed_idat)) + b'IDAT' + compressed_idat + struct.pack('>I', idat_crc))
    png_bytes.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND')))
    os.makedirs(os.path.dirname(os.path.abspath(output_filepath)), exist_ok=True)
    with open(output_filepath, 'wb') as f:
        f.write(png_bytes)
    return output_filepath

def parse_ascii_art(ascii_lines, palette, width=32, height=32):
    grid = [[(0, 0, 0, 0) for _ in range(width)] for _ in range(height)]
    for y, line in enumerate(ascii_lines[:height]):
        for x, char in enumerate(line[:width]):
            if char in palette:
                color = palette[char]
                grid[y][x] = hex_to_rgba(color) if isinstance(color, str) else color
            elif char in (' ', '.', '_'):
                grid[y][x] = (0, 0, 0, 0)
    return grid

def generate_dandelion_sprite():
    P = {
        '.': (0, 0, 0, 0),
        'S': (15, 35, 15, 60),
        'd': hex_to_rgba('#1b381e'),
        'g': hex_to_rgba('#2d6332'),
        'G': hex_to_rgba('#438f4a'),
        'L': hex_to_rgba('#6ec25d'),
        's': hex_to_rgba('#3c7a36'),
        'H': hex_to_rgba('#5ca84a'),
        'a': hex_to_rgba('#945400'),
        'A': hex_to_rgba('#c47800'),
        'O': hex_to_rgba('#e89c00'),
        'y': hex_to_rgba('#f5c400'),
        'Y': hex_to_rgba('#ffe121'),
        'W': hex_to_rgba('#fff685'),
        'w': hex_to_rgba('#ffffff', 220)
    }
    matrix = [
        '................................',
        '................................',
        '................................',
        '............aAAaa...............',
        '..........aAYYYYYAaa............',
        '.........aAYWWYYYYYAa...........',
        '........aAYWWwWYYYYyAa..........',
        '.......aAYWWwwWWYYYYyAa.........',
        '.......AAYWWwWYYYYYYyOA.........',
        '.......AYYYYYYYYYYYyyOA.........',
        '.......AYYYyYYYYYyyyyOA.........',
        '........AYYyyyyyyyOOAA..........',
        '.........aAOOyyOOOAaa...........',
        '...........dgdgdgd..............',
        '............dggd................',
        '.............sHd................',
        '.............sHd................',
        '.............sHd................',
        '............dsHd................',
        '............dsHd................',
        '..........d..sHd..d.............',
        '.........dGd.sHd.dGd............',
        '........dGLGdsHddGLGd...........',
        '.......dGLGLGsHssGLGLd..........',
        '......dGLGLGLgHHGGLGLGd.........',
        '.....dGLGGLGLgsHGGLGLGLd........',
        '....dGLLGGLLGgsHGGLLGGLLd.......',
        '....ddddddddddddddddddddd.......',
        '.....SSSSSSSSSSSSSSSSSSS........',
        '.......SSSSSSSSSSSSSSS..........',
        '................................',
        '................................',
    ]
    return parse_ascii_art(matrix, P, 32, 32)

def generate_clover_sprite():
    P = {
        '.': (0, 0, 0, 0),
        'S': (15, 35, 15, 60),
        'd': hex_to_rgba('#163519'),
        'g': hex_to_rgba('#275c2c'),
        'G': hex_to_rgba('#3c8c43'),
        'L': hex_to_rgba('#65bd6d'),
        'W': hex_to_rgba('#e8f7ea'),
        's': hex_to_rgba('#2f6e35')
    }
    matrix = [
        '................................',
        '................................',
        '................................',
        '................................',
        '...........dggddggd.............',
        '.........dgGLLggLLGgd...........',
        '........dgGLWWggWWLGgd..........',
        '........dgGLGGggGGLGgd..........',
        '.........dggGGggGGggd...........',
        '....dggd...dggssggd...dggd......',
        '..dgGLLggd..dgssgd..dgGLLggd....',
        '.dgGLWWGLGgd.dssd.dgGLWWGLGgd...',
        '.dgGLGGGLGgd.dssd.dgGLGGGLGgd...',
        '..dggGGGGGgd.dssd.dggGGGGGgd....',
        '....dggGGggd.dssd.dggGGggd......',
        '.......dggd...ss...dggd.........',
        '.............dssd...............',
        '.............dssd...............',
        '............dgssgd..............',
        '............dgssgd..............',
        '...........dgGssGgd.............',
        '..........dgGLssLGgd............',
        '.........dgGLWssWLGgd...........',
        '.........dgGLGssGLGgd...........',
        '..........dggGssGggd............',
        '............dgssgd..............',
        '.............dssd...............',
        '.............dssd...............',
        '.....SSSSSSSSSSSSSSSSSSS........',
        '.......SSSSSSSSSSSSSSS..........',
        '................................',
        '................................',
    ]
    return parse_ascii_art(matrix, P, 32, 32)

def save_asset(pixel_grid, filename, categories=('flora', 'tilemaps')):
    saved = []
    for cat in categories:
        target_dir = CATEGORY_DIRECTORIES.get(cat, CATEGORY_DIRECTORIES['tilemaps'])
        out_path = os.path.join(target_dir, filename)
        write_png_rgba(32, 32, pixel_grid, out_path)
        saved.append(out_path)
    return saved

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='TastyTails 32x32 Asset Artist')
    parser.add_argument('--template', choices=['dandelion', 'clover'], default='dandelion', help='Template to generate')
    parser.add_argument('--name', default=None, help='Output filename')
    parser.add_argument('--category', nargs='+', default=['flora', 'tilemaps'], help='Categories')
    args = parser.parse_args()

    if args.template == 'dandelion':
        grid = generate_dandelion_sprite()
        filename = args.name or 'flora_dandelion.png'
    elif args.template == 'clover':
        grid = generate_clover_sprite()
        filename = args.name or 'flora_clover.png'

    paths = save_asset(grid, filename, args.category)
    for p in paths:
        print(f'Asset saved: {p}')
