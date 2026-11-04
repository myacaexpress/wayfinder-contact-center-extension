/* Only fixed operational labels are extracted. Never send page text. */
(function(root) {
  function detect({statuses = [], busyLabels = [], agency = false}) {
    // Agency tables describe other agents; never infer this user's state from them.
    if (agency) return 'unknown';
    const busy = {'Ringing':'ringing','Incoming call':'ringing','Talking':'talking','On a call':'talking','Dispositioning':'wrap','After-call work':'wrap'};
    for (const label of [...statuses, ...busyLabels]) if (busy[label]) return busy[label];
    if (statuses.includes("You're Off – No Calls Will Be Sent")) return 'off';
    if (statuses.includes('Waiting') || statuses.includes('Online - Taking Calls')) return 'waiting';
    return 'unknown';
  }
  root.wayfinderAllCallsDetect = detect;
})(globalThis);
