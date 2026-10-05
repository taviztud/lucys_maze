import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { CONFIG } from '../Config';

export interface UIButtonOptions {
    width: number;
    height: number;
    label: string;
    onClick: () => void;
    fontSize?: number;
    /** Accent used for the border and the label. */
    color?: number;
}

const FILL = 0x111118;
const FILL_HOVER = 0x262636;

/** Touch-sized canvas button: a bordered rectangle with a centred label. */
export class UIButton extends Phaser.GameObjects.Container {
    private readonly background: Phaser.GameObjects.Rectangle;
    private readonly label: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, options: UIButtonOptions) {
        super(scene, x, y);

        const color = options.color ?? 0x4cc9f0;
        this.background = scene.add.rectangle(0, 0, options.width, options.height, FILL)
            .setStrokeStyle(2, color)
            .setInteractive({ useHandCursor: true });
        this.label = scene.add.text(0, 0, options.label, {
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fontSize: `${options.fontSize ?? 14}px`,
            color: `#${color.toString(16).padStart(6, '0')}`,
            align: 'center'
        }).setOrigin(0.5);
        this.add([this.background, this.label]);

        this.background.on(Phaser.Input.Events.POINTER_OVER, () => this.background.setFillStyle(FILL_HOVER));
        this.background.on(Phaser.Input.Events.POINTER_OUT, () => {
            this.background.setFillStyle(FILL);
            this.setScale(1);
        });
        this.background.on(Phaser.Input.Events.POINTER_DOWN, () => this.setScale(0.96));
        // Acting on release keeps the browser's user activation (audio, fullscreen).
        this.background.on(Phaser.Input.Events.POINTER_UP, () => {
            this.setScale(1);
            playSfx(scene, 'ui');
            options.onClick();
        });

        scene.add.existing(this);
    }

    setLabel(text: string): this {
        this.label.setText(text);
        return this;
    }
}
