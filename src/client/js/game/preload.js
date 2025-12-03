export function preload() {
    console.log('Preload Started');

    // 1. Get Center of Canvas
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // 2. Create the Wooden Signboard (Background)
    const boxW = 320;
    const boxH = 100;
    const bgBox = this.add.graphics();
    bgBox.fillStyle(0x3e2723, 1); // Dark Wood
    bgBox.lineStyle(4, 0xffc107, 1); // Gold Border
    bgBox.fillRoundedRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH, 16);
    bgBox.strokeRoundedRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH, 16);

    // 3. Create the "Empty Slot" (Dark Leather Track)
    const barW = 280;
    const barH = 24;
    const barBg = this.add.graphics();
    barBg.fillStyle(0x1a120e, 1); // Very Dark Leather
    barBg.fillRoundedRect(centerX - barW / 2, centerY + 15, barW, barH, 10);

    // 4. Create the Progress Fill (Gold/Ale)
    const progressBar = this.add.graphics();

    // 5. Playful Text
    const loadingMessages = [
        "Waking the Innkeeper...",
        "Polishing Tankards...",
        "Herding Cats...",
        "Sharpening Claws...",
        "Rolling Dice...",
        "Checking Inventory...",
        "Opening the Tavern..."
    ];

    const loadingText = this.make.text({
        x: centerX,
        y: centerY - 15,
        text: loadingMessages[0],
        style: {
            font: '20px Cinzel',
            fill: '#f3e5ab', // Parchment
            align: 'center'
        }
    }).setOrigin(0.5);

    // 6. Percentage Text (Over the bar)
    const percentText = this.make.text({
        x: centerX,
        y: centerY + 27,
        text: '0%',
        style: {
            font: '14px Lato',
            fill: '#f3e5ab',
            fontStyle: 'bold'
        }
    }).setOrigin(0.5);

    // --- LOADING EVENTS ---
    this.load.on('progress', function (value) {
        // Clear old bar
        progressBar.clear();

        // Draw Gold Fill
        progressBar.fillStyle(0xffc107, 1);
        // Calculate width based on progress (min width 10 so it's visible)
        const w = Math.max(10, barW * value);

        // Only draw if we have progress
        if (value > 0) {
            progressBar.fillRoundedRect(centerX - barW / 2, centerY + 15, w, barH, 10);
        }

        // Update Text Percentage
        percentText.setText(parseInt(value * 100) + '%');

        // Cycle playful messages based on progress chunks (every 20%)
        const msgIndex = Math.floor(value * 5) % loadingMessages.length;
        loadingText.setText(loadingMessages[msgIndex]);
    });

    this.load.on('complete', function () {
        // Destroy all loading graphics when done
        bgBox.destroy();
        barBg.destroy();
        progressBar.destroy();
        loadingText.destroy();
        percentText.destroy();
    });
    // this.load.image('spritesheet', './../assets/images/spritesheet.png');
    this.load.image('tileset', './../assets/tilemaps/tileset.png');
    this.load.spritesheet('tilesetSprite', './../assets/tilemaps/tileset.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('scroll', './../assets/images/Scroll_01.png')
    this.load.image('scroll2', './../assets/images/Scroll_02.png')

    this.spritesToAnimate = []; // Initialize the array
    this.load.spritesheet('empty', './../assets/spritesheets/empty.png', { frameWidth: 109, frameHeight: 220 });
    this.spritesToAnimate.push('empty');
    this.load.spritesheet('body_01-empty', './../assets/spritesheets/empty.png', { frameWidth: 109, frameHeight: 220 });
    this.spritesToAnimate.push('body_01-empty');
    this.load.spritesheet('body_02-empty', './../assets/spritesheets/empty.png', { frameWidth: 109, frameHeight: 220 });
    this.spritesToAnimate.push('body_02-empty');
    this.load.spritesheet('body_03-empty', './../assets/spritesheets/empty.png', { frameWidth: 109, frameHeight: 220 });
    this.spritesToAnimate.push('body_03-empty');
    this.load.spritesheet('body_04-empty', './../assets/spritesheets/empty.png', { frameWidth: 109, frameHeight: 220 });
    this.spritesToAnimate.push('body_04-empty');



    // Body Sprites
    this.load.spritesheet('body_01', './../assets/spritesheets/body_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01');

    // Secondary Body Sprites
    this.load.spritesheet('body_01-secondary_01', './../assets/spritesheets/body_01-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-secondary_01');
    this.load.spritesheet('body_01-secondary_02', './../assets/spritesheets/body_01-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-secondary_02');
    this.load.spritesheet('body_01-secondary_03', './../assets/spritesheets/body_01-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-secondary_03');
    this.load.spritesheet('body_01-secondary_04', './../assets/spritesheets/body_01-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-secondary_04');


    // Accent Body Sprites
    this.load.spritesheet('body_01-accent_01', './../assets/spritesheets/body_01-accent_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-accent_01');
    this.load.spritesheet('body_01-accent_02', './../assets/spritesheets/body_01-accent_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-accent_02');
    this.load.spritesheet('body_01-accent_03', './../assets/spritesheets/body_01-accent_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-accent_03');

    // Hand Secondary Sprites
    this.load.spritesheet('body_01-hands-secondary_01', './../assets/spritesheets/body_01-hands-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-hands-secondary_01');
    this.load.spritesheet('body_01-hands-secondary_02', './../assets/spritesheets/body_01-hands-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-hands-secondary_02');


    // Feet Secondary Sprites
    this.load.spritesheet('body_01-feet-secondary_01', './../assets/spritesheets/body_01-feet-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-feet-secondary_01');
    this.load.spritesheet('body_01-feet-secondary_02', './../assets/spritesheets/body_01-feet-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('body_01-feet-secondary_02');








    // Ear Sprites
    this.load.spritesheet('ears_01-outer', './../assets/spritesheets/ears_01-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_01-outer');
    this.load.spritesheet('ears_01-inner', './../assets/spritesheets/ears_01-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_01-inner');

    this.load.spritesheet('ears_02-outer', './../assets/spritesheets/ears_02-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_02-outer');
    this.load.spritesheet('ears_02-inner', './../assets/spritesheets/ears_02-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_02-inner');

    this.load.spritesheet('ears_03-outer', './../assets/spritesheets/ears_03-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_03-outer');
    this.load.spritesheet('ears_03-inner', './../assets/spritesheets/ears_03-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_03-inner');

    this.load.spritesheet('ears_04-outer', './../assets/spritesheets/ears_04-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_04-outer');
    this.load.spritesheet('ears_04-inner', './../assets/spritesheets/ears_04-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_04-inner');

    this.load.spritesheet('ears_05-outer', './../assets/spritesheets/ears_05-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_05-outer');
    this.load.spritesheet('ears_05-inner', './../assets/spritesheets/ears_05-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_05-inner');

    this.load.spritesheet('ears_06-outer', './../assets/spritesheets/ears_06-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_06-outer');
    this.load.spritesheet('ears_06-inner', './../assets/spritesheets/ears_06-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_06-inner');

    this.load.spritesheet('ears_07-outer', './../assets/spritesheets/ears_07-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_07-outer');
    this.load.spritesheet('ears_07-inner', './../assets/spritesheets/ears_07-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_07-inner');

    this.load.spritesheet('ears_08-outer', './../assets/spritesheets/ears_08-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_08-outer');
    this.load.spritesheet('ears_08-inner', './../assets/spritesheets/ears_08-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_08-inner');

    this.load.spritesheet('ears_09-outer', './../assets/spritesheets/ears_09-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_09-outer');
    this.load.spritesheet('ears_09-inner', './../assets/spritesheets/ears_09-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_09-inner');

    this.load.spritesheet('ears_10-outer', './../assets/spritesheets/ears_10-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_10-outer');
    this.load.spritesheet('ears_10-inner', './../assets/spritesheets/ears_10-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_10-inner');

    this.load.spritesheet('ears_11-outer', './../assets/spritesheets/ears_11-outer.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_11-outer');
    this.load.spritesheet('ears_11-inner', './../assets/spritesheets/ears_11-inner.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('ears_11-inner');


    // Eyes Sprites
    this.load.spritesheet('eyes_01', './../assets/spritesheets/eyes_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('eyes_01');
    this.load.spritesheet('eyes_02', './../assets/spritesheets/eyes_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('eyes_02');

    // Head Accessories
    this.load.spritesheet('headAccessories_01', './../assets/spritesheets/headAccessories_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('headAccessories_01');
    this.load.spritesheet('headAccessories_02', './../assets/spritesheets/headAccessories_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('headAccessories_02');
    this.load.spritesheet('headAccessories_03', './../assets/spritesheets/headAccessories_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('headAccessories_03');
    this.load.spritesheet('headAccessories_04', './../assets/spritesheets/headAccessories_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('headAccessories_04');
    this.load.spritesheet('headAccessories_05', './../assets/spritesheets/headAccessories_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('headAccessories_05');



    // Head Sprites
    this.load.spritesheet('head_01', './../assets/spritesheets/head_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01');
    this.load.spritesheet('head_02', './../assets/spritesheets/head_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02');
    this.load.spritesheet('head_03', './../assets/spritesheets/head_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03');
    this.load.spritesheet('head_04', './../assets/spritesheets/head_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04');
    this.load.spritesheet('head_05', './../assets/spritesheets/head_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05');
    this.load.spritesheet('head_06', './../assets/spritesheets/head_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06');


    // Secondary Head Sprites for head_01
    this.load.spritesheet('head_01-secondary_01', './../assets/spritesheets/head_01-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01-secondary_01');
    this.load.spritesheet('head_01-secondary_02', './../assets/spritesheets/head_01-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01-secondary_02');
    this.load.spritesheet('head_01-secondary_03', './../assets/spritesheets/head_01-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01-secondary_03');
    this.load.spritesheet('head_01-secondary_04', './../assets/spritesheets/head_01-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01-secondary_04');
    this.load.spritesheet('head_01-secondary_05', './../assets/spritesheets/head_01-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_01-secondary_05');

    // Secondary Head Sprites for head_02
    this.load.spritesheet('head_02-secondary_01', './../assets/spritesheets/head_02-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02-secondary_01');
    this.load.spritesheet('head_02-secondary_02', './../assets/spritesheets/head_02-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02-secondary_02');
    this.load.spritesheet('head_02-secondary_03', './../assets/spritesheets/head_02-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02-secondary_03');
    this.load.spritesheet('head_02-secondary_04', './../assets/spritesheets/head_02-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02-secondary_04');
    this.load.spritesheet('head_02-secondary_05', './../assets/spritesheets/head_02-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_02-secondary_05');

    // Secondary Head Sprites for head_03
    this.load.spritesheet('head_03-secondary_01', './../assets/spritesheets/head_03-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03-secondary_01');
    this.load.spritesheet('head_03-secondary_02', './../assets/spritesheets/head_03-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03-secondary_02');
    this.load.spritesheet('head_03-secondary_03', './../assets/spritesheets/head_03-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03-secondary_03');
    this.load.spritesheet('head_03-secondary_04', './../assets/spritesheets/head_03-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03-secondary_04');
    this.load.spritesheet('head_03-secondary_05', './../assets/spritesheets/head_03-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_03-secondary_05');

    // Secondary Head Sprites for head_04
    this.load.spritesheet('head_04-secondary_01', './../assets/spritesheets/head_04-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04-secondary_01');
    this.load.spritesheet('head_04-secondary_02', './../assets/spritesheets/head_04-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04-secondary_02');
    this.load.spritesheet('head_04-secondary_03', './../assets/spritesheets/head_04-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04-secondary_03');
    this.load.spritesheet('head_04-secondary_04', './../assets/spritesheets/head_04-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04-secondary_04');
    this.load.spritesheet('head_04-secondary_05', './../assets/spritesheets/head_04-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_04-secondary_05');

    // Secondary Head Sprites for head_05
    this.load.spritesheet('head_05_beak', './../assets/spritesheets/head_05_beak.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05_beak');
    this.load.spritesheet('head_05-secondary_01', './../assets/spritesheets/head_05-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05-secondary_01');
    this.load.spritesheet('head_05-secondary_02', './../assets/spritesheets/head_05-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05-secondary_02');
    this.load.spritesheet('head_05-secondary_03', './../assets/spritesheets/head_05-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05-secondary_03');
    this.load.spritesheet('head_05-secondary_04', './../assets/spritesheets/head_05-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05-secondary_04');
    this.load.spritesheet('head_05-secondary_05', './../assets/spritesheets/head_05-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_05-secondary_05');

    // Secondary Head Sprites for head_06
    this.load.spritesheet('head_06-secondary_01', './../assets/spritesheets/head_06-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06-secondary_01');
    this.load.spritesheet('head_06-secondary_02', './../assets/spritesheets/head_06-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06-secondary_02');
    this.load.spritesheet('head_06-secondary_03', './../assets/spritesheets/head_06-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06-secondary_03');
    this.load.spritesheet('head_06-secondary_04', './../assets/spritesheets/head_06-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06-secondary_04');
    this.load.spritesheet('head_06-secondary_05', './../assets/spritesheets/head_06-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('head_06-secondary_05');

    // Tail Sprites
    this.load.spritesheet('tail_01', './../assets/spritesheets/tail_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01');
    this.load.spritesheet('tail_02', './../assets/spritesheets/tail_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02');
    this.load.spritesheet('tail_03', './../assets/spritesheets/tail_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03');
    this.load.spritesheet('tail_04', './../assets/spritesheets/tail_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04');
    this.load.spritesheet('tail_05', './../assets/spritesheets/tail_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05');
    this.load.spritesheet('tail_06', './../assets/spritesheets/tail_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06');
    this.load.spritesheet('tail_07', './../assets/spritesheets/tail_07.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07');


    // Secondary Tail Sprites for tail_01
    this.load.spritesheet('tail_01-secondary_01', './../assets/spritesheets/tail_01-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_01');
    this.load.spritesheet('tail_01-secondary_02', './../assets/spritesheets/tail_01-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_02');
    this.load.spritesheet('tail_01-secondary_03', './../assets/spritesheets/tail_01-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_03');
    this.load.spritesheet('tail_01-secondary_04', './../assets/spritesheets/tail_01-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_04');
    this.load.spritesheet('tail_01-secondary_05', './../assets/spritesheets/tail_01-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_05');
    this.load.spritesheet('tail_01-secondary_06', './../assets/spritesheets/tail_01-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_01-secondary_06');

    // Secondary Tail Sprites for tail_02
    this.load.spritesheet('tail_02-secondary_01', './../assets/spritesheets/tail_02-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_01');
    this.load.spritesheet('tail_02-secondary_02', './../assets/spritesheets/tail_02-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_02');
    this.load.spritesheet('tail_02-secondary_03', './../assets/spritesheets/tail_02-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_03');
    this.load.spritesheet('tail_02-secondary_04', './../assets/spritesheets/tail_02-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_04');
    this.load.spritesheet('tail_02-secondary_05', './../assets/spritesheets/tail_02-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_05');
    this.load.spritesheet('tail_02-secondary_06', './../assets/spritesheets/tail_02-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_02-secondary_06');

    // Secondary Tail Sprites for tail_03
    this.load.spritesheet('tail_03-secondary_01', './../assets/spritesheets/tail_03-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_01');
    this.load.spritesheet('tail_03-secondary_02', './../assets/spritesheets/tail_03-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_02');
    this.load.spritesheet('tail_03-secondary_03', './../assets/spritesheets/tail_03-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_03');
    this.load.spritesheet('tail_03-secondary_04', './../assets/spritesheets/tail_03-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_04');
    this.load.spritesheet('tail_03-secondary_05', './../assets/spritesheets/tail_03-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_05');
    this.load.spritesheet('tail_03-secondary_06', './../assets/spritesheets/tail_03-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_03-secondary_06');

    // Secondary Tail Sprites for tail_04
    this.load.spritesheet('tail_04-secondary_01', './../assets/spritesheets/tail_04-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_01');
    this.load.spritesheet('tail_04-secondary_02', './../assets/spritesheets/tail_04-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_02');
    this.load.spritesheet('tail_04-secondary_03', './../assets/spritesheets/tail_04-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_03');
    this.load.spritesheet('tail_04-secondary_04', './../assets/spritesheets/tail_04-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_04');
    this.load.spritesheet('tail_04-secondary_05', './../assets/spritesheets/tail_04-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_05');
    this.load.spritesheet('tail_04-secondary_06', './../assets/spritesheets/tail_04-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_04-secondary_06');

    // Secondary Tail Sprites for tail_05
    this.load.spritesheet('tail_05-secondary_01', './../assets/spritesheets/tail_05-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_01');
    this.load.spritesheet('tail_05-secondary_02', './../assets/spritesheets/tail_05-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_02');
    this.load.spritesheet('tail_05-secondary_03', './../assets/spritesheets/tail_05-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_03');
    this.load.spritesheet('tail_05-secondary_04', './../assets/spritesheets/tail_05-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_04');
    this.load.spritesheet('tail_05-secondary_05', './../assets/spritesheets/tail_05-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_05');
    this.load.spritesheet('tail_05-secondary_06', './../assets/spritesheets/tail_05-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_05-secondary_06');

    // Secondary Tail Sprites for tail_06
    this.load.spritesheet('tail_06-secondary_01', './../assets/spritesheets/tail_06-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_01');
    this.load.spritesheet('tail_06-secondary_02', './../assets/spritesheets/tail_06-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_02');
    this.load.spritesheet('tail_06-secondary_03', './../assets/spritesheets/tail_06-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_03');
    this.load.spritesheet('tail_06-secondary_04', './../assets/spritesheets/tail_06-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_04');
    this.load.spritesheet('tail_06-secondary_05', './../assets/spritesheets/tail_06-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_05');
    this.load.spritesheet('tail_06-secondary_06', './../assets/spritesheets/tail_06-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_06-secondary_06');

    // Secondary Tail Sprites for tail_07
    this.load.spritesheet('tail_07-secondary_01', './../assets/spritesheets/tail_07-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_01');
    this.load.spritesheet('tail_07-secondary_02', './../assets/spritesheets/tail_07-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_02');
    this.load.spritesheet('tail_07-secondary_03', './../assets/spritesheets/tail_07-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_03');
    this.load.spritesheet('tail_07-secondary_04', './../assets/spritesheets/tail_07-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_04');
    this.load.spritesheet('tail_07-secondary_05', './../assets/spritesheets/tail_07-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_05');
    this.load.spritesheet('tail_07-secondary_06', './../assets/spritesheets/tail_07-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_07-secondary_06');

    // Secondary Tail Sprites for tail_08
    this.load.spritesheet('tail_08-secondary_01', './../assets/spritesheets/tail_08-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_01');
    this.load.spritesheet('tail_08-secondary_02', './../assets/spritesheets/tail_08-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_02');
    this.load.spritesheet('tail_08-secondary_03', './../assets/spritesheets/tail_08-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_03');
    this.load.spritesheet('tail_08-secondary_04', './../assets/spritesheets/tail_08-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_04');
    this.load.spritesheet('tail_08-secondary_05', './../assets/spritesheets/tail_08-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_05');
    this.load.spritesheet('tail_08-secondary_06', './../assets/spritesheets/tail_08-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_08-secondary_06');

    // Secondary Tail Sprites for tail_09
    this.load.spritesheet('tail_09-secondary_01', './../assets/spritesheets/tail_09-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_01');
    this.load.spritesheet('tail_09-secondary_02', './../assets/spritesheets/tail_09-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_02');
    this.load.spritesheet('tail_09-secondary_03', './../assets/spritesheets/tail_09-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_03');
    this.load.spritesheet('tail_09-secondary_04', './../assets/spritesheets/tail_09-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_04');
    this.load.spritesheet('tail_09-secondary_05', './../assets/spritesheets/tail_09-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_05');
    this.load.spritesheet('tail_09-secondary_06', './../assets/spritesheets/tail_09-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_09-secondary_06');

    // Secondary Tail Sprites for tail_10
    this.load.spritesheet('tail_10-secondary_01', './../assets/spritesheets/tail_10-secondary_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_01');
    this.load.spritesheet('tail_10-secondary_02', './../assets/spritesheets/tail_10-secondary_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_02');
    this.load.spritesheet('tail_10-secondary_03', './../assets/spritesheets/tail_10-secondary_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_03');
    this.load.spritesheet('tail_10-secondary_04', './../assets/spritesheets/tail_10-secondary_04.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_04');
    this.load.spritesheet('tail_10-secondary_05', './../assets/spritesheets/tail_10-secondary_05.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_05');
    this.load.spritesheet('tail_10-secondary_06', './../assets/spritesheets/tail_10-secondary_06.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('tail_10-secondary_06');


    // Hair Sprites
    this.load.spritesheet('hair-front_01', './../assets/spritesheets/hair-front_01.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('hair-front_01');
    this.load.spritesheet('hair-front_02', './../assets/spritesheets/hair-front_02.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('hair-front_02');
    this.load.spritesheet('hair-front_03', './../assets/spritesheets/hair-front_03.png', { frameWidth: 215, frameHeight: 198 });
    this.spritesToAnimate.push('hair-front_03');


    //This loads the map json file that says what coordinates have what pictures
    // this.load.tilemapTiledJSON('level_2', './../assets/tilemaps/level2.json');
    // this.load.tilemapTiledJSON('tastytails_v01', './../assets/tilemaps/tastytails_v01.json');
    this.load.tilemapTiledJSON('demo_map', './../assets/tilemaps/Demo_Map.json');

    //----- Loads images used for interactive objects -----//
    this.load.image('tree_01', './../assets/tilemaps/tree_01.png');
    this.load.image('tree_02', './../assets/tilemaps/tree_02.png');
    this.load.image('lamp_01', './../assets/tilemaps/lamp_01.png');
    this.load.image('lamp_02', './../assets/tilemaps/lamp_02.png');
    this.load.image('cloth_shelf_01', './../assets/tilemaps/cloth_shelf_01.png');
    this.load.image('cloth_shelf_02', './../assets/tilemaps/cloth_shelf_02.png');
    this.load.image('mirror_01', './../assets/tilemaps/mirror_01.png');
    this.load.image('mannequin_00', './../assets/tilemaps/mannequin_00.png');
    this.load.image('mannequin_01', './../assets/tilemaps/mannequin_01.png');
    this.load.image('mannequin_02', './../assets/tilemaps/mannequin_02.png');
    this.load.image('sewing_machine_01', './../assets/tilemaps/sewing_machine_01.png');
    this.load.image('cloth_roll_basket01', './../assets/tilemaps/cloth_roll_basket01.png');
    this.load.image('yarn_basket_01', './../assets/tilemaps/yarn_basket_01.png');

    this.load.image('pub_table', './../assets/tilemaps/pub_table.png');
    this.load.image('pub_stool', './../assets/tilemaps/pub_stool.png');
    this.load.image('bar_front', './../assets/tilemaps/bar_front.png');
    this.load.image('card_table', './../assets/tilemaps/card_table.png');
    this.load.image('pub_stool_tall', './../assets/tilemaps/pub_stool_tall.png');

    this.load.image('spa_massage_bed', './../assets/tilemaps/spa_massage_bed.png');


    //----- Doors -----//
    this.load.spritesheet('door_clothing_store', './../assets/spritesheets/door_clothing_store.png', { frameWidth: 197, frameHeight: 255 });
    this.load.image('clothing_store_exit_rug', './../assets/tilemaps/clothing_store_exit_rug.png');

    this.load.spritesheet('door_pub', './../assets/spritesheets/door_pub.png', { frameWidth: 197, frameHeight: 255 });
    this.load.image('pub_exit_rug', './../assets/tilemaps/pub_exit_rug.png');

    this.load.spritesheet('door_spa', './../assets/spritesheets/door_spa.png', { frameWidth: 197, frameHeight: 255 });
}
