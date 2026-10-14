// Logo do I.A Prof: "I.A" em cima e "Prof" embaixo, com a mesma largura.
// As cores seguem o tema (claro/escuro) pelas classes de texto.
export default function Logo({ className = "h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 99.38" className={`w-auto ${className}`} role="img" aria-label="I.A Prof">
      <path className="text-slate-800" fill="currentColor" transform="translate(-4.24 53.41) scale(0.07576)" d="M252 -705V0H56V-705Z" />
      <path className="text-amber-400" fill="currentColor" transform="translate(-4.24 53.41) scale(0.07576)" d="M354 -93Q354 -137 385.5 -166.0Q417 -195 469 -195Q520 -195 551.5 -166.0Q583 -137 583 -93Q583 -50 551.5 -21.0Q520 8 469 8Q417 8 385.5 -20.5Q354 -49 354 -93Z" />
      <path className="text-slate-800" fill="currentColor" transform="translate(-4.24 53.41) scale(0.07576)" d="M1131 -115H881L843 0H637L894 -705H1120L1376 0H1169ZM1082 -265 1006 -493 931 -265Z" />
      <path className="text-indigo-600" fill="currentColor" transform="translate(-2.81 99.03) scale(0.05020)" d="M349 -238H252V0H56V-705H349Q434 -705 493.5 -675.0Q553 -645 583.0 -592.0Q613 -539 613 -470Q613 -406 583.5 -353.5Q554 -301 494.5 -269.5Q435 -238 349 -238ZM413 -470Q413 -547 330 -547H252V-394H330Q413 -394 413 -470Z M1059 -566V-357H1004Q940 -357 909.0 -332.0Q878 -307 878 -245V0H682V-561H878V-462Q911 -510 958.0 -538.0Q1005 -566 1059 -566Z M1087 -281Q1087 -368 1125.5 -433.0Q1164 -498 1230.5 -533.0Q1297 -568 1381 -568Q1465 -568 1531.5 -533.0Q1598 -498 1636.5 -433.0Q1675 -368 1675 -281Q1675 -194 1636.5 -128.5Q1598 -63 1531.0 -28.0Q1464 7 1380 7Q1296 7 1229.5 -28.0Q1163 -63 1125.0 -128.0Q1087 -193 1087 -281ZM1476 -281Q1476 -338 1448.5 -368.0Q1421 -398 1381 -398Q1341 -398 1314.0 -368.0Q1287 -338 1287 -281Q1287 -223 1313.0 -193.0Q1339 -163 1380 -163Q1421 -163 1448.5 -193.5Q1476 -224 1476 -281Z M2048 -398H1960V0H1763V-398H1702V-561H1763V-566Q1763 -674 1826.5 -731.5Q1890 -789 2009 -789Q2033 -789 2046 -788V-621Q2038 -622 2024 -622Q1992 -622 1977.0 -607.5Q1962 -593 1960 -561H2048Z" />
    </svg>
  );
}
