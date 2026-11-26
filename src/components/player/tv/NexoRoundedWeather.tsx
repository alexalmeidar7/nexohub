export function NexoRoundedWeather({code,night}:{code:number;night:boolean}) {
  const clear=code===0, partly=code===1||code===2;
  const thunder=code>=95, snow=(code>=71&&code<=77)||code===85||code===86;
  const rain=(code>=51&&code<=67)||(code>=80&&code<=82);
  const fog=code===45||code===48;
  return <svg className="nexo-rounded-weather" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(clear||partly)&&<g transform={partly?'translate(-5 -6) scale(.77)':undefined}>
      {night?<path className="nexo-wx5-moon" d="M29 7a17 17 0 1 0 12 24A16 16 0 0 1 29 7Z"/>:<g className="nexo-wx5-sun"><circle cx="24" cy="24" r="9"/>{[0,45,90,135,180,225,270,315].map(n=><path key={n} d="M24 4v5" transform={`rotate(${n} 24 24)`}/>)}</g>}
    </g>}
    {!clear&&<g className="nexo-wx5-cloud"><path d="M12 34a8 8 0 0 1-1-16 12 12 0 0 1 23-1 9 9 0 0 1 1 17Z"/></g>}
    {rain&&<g className="nexo-wx5-rain"><path d="m15 39-2 4m12-4-2 4m12-4-2 4"/></g>}
    {snow&&<g className="nexo-wx5-snow"><path d="M15 37v8m-4-4h8m14-4v8m-4-4h8"/></g>}
    {thunder&&<path className="nexo-wx5-flash" d="m25 27-8 10h8l-3 8 12-14h-9Z" fill="currentColor" stroke="none"/>}
    {fog&&<g className="nexo-wx5-fog"><path d="M9 39h30M15 44h18"/></g>}
  </svg>;
}
