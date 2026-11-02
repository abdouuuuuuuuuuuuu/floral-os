/** Crop the lotus emblem from the approved Blossom lockup so every animated
 * mark uses the exact brand artwork rather than a hand-drawn approximation. */
export default function BlossomGlyph({ className = '', title = 'Blossom' }) {
  return (
    <span className={`blossom-glyph ${className}`} role="img" aria-label={title}>
      <img src="./logo-Black.png" alt="" draggable="false" />
    </span>
  )
}
