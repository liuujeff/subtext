/** The rules in plain words, for the "How to play" drawer. */
export function HowScoring() {
  return (
    <ul className="rules">
      <li>
        A good guess fits <strong>both</strong> words. One that only fits one side scores low.
      </li>
      <li>Scores go up to 100, and your best guess in each pair counts.</li>
      <li>
        Each pair gets <strong>60 seconds</strong>. Press Start to see the two words; the clock
        starts then. When it runs out, your best guess so far counts.
      </li>
      <li>
        On the sonar, the crosshair in the middle is the best possible word: the closer your blip,
        the higher it scores. A blip that swings to one side leans toward that word.
      </li>
      <li>Each guess fires a torpedo. The rack in the corner shows how many you have left.</li>
      <li>Catch-all words like “thing” don’t score well.</li>
      <li>New pairs every day at midnight, New York time.</li>
    </ul>
  );
}
