//===================================================
// Iaido is Back - Game Test
// Main entry point
// Adobe AIR + ActionScript 3.0
//===================================================

package {
    import flash.display.Sprite;
    import flash.display.StageAlign;
    import flash.display.StageScaleMode;
    import flash.events.Event;
    import flash.text.TextField;
    import flash.text.TextFormat;

    /**
     * Classe principale de l'application
     */
    [SWF(width="800", height="600", frameRate="60", backgroundColor="#000000")]
    public class Main extends Sprite {
        
        private var _stage:Object;
        
        /**
         * Constructeur
         */
        public function Main() {
            super();
            
            // Attendre que la stage soit disponible
            addEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
        }
        
        /**
         * Initialisation une fois ajouté à la stage
         */
        private function onAddedToStage(event:Event):void {
            removeEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
            
            // Configuration de la stage
            stage.align = StageAlign.TOP_LEFT;
            stage.scaleMode = StageScaleMode.NO_SCALE;
            stage.frameRate = 60;
            
            // Initialiser le jeu
            init();
        }
        
        /**
         * Initialisation du jeu
         */
        private function init():void {
            trace("=== Iaido is Back - Game Test ===");
            
            // Créer une scène de test
            createTestScene();
        }
        
        /**
         * Création d'une scène de test
         */
        private function createTestScene():void {
            // Fond noir
            graphics.beginFill(0x000000);
            graphics.drawRect(0, 0, 800, 600);
            graphics.endFill();
            
            // Texte d'exemple
            var textField:TextField = new TextField();
            textField.text = "Iaido is Back\nAIR SDK Ready!";
            textField.width = 300;
            textField.height = 100;
            textField.x = 250;
            textField.y = 250;
            textField.setTextFormat(new TextFormat("Arial", 24, 0xFFFFFF));
            textField.background = true;
            textField.backgroundColor = 0x000000;
            textField.border = true;
            textField.borderColor = 0xFFFFFF;
            addChild(textField);
            
            trace("Scene de test créée !");
        }
    }
}
