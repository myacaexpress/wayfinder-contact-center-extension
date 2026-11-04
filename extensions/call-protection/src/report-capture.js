(() => {
  const outcomes = new Set(['Enrolled','Follow-Up Needed','Best Plan Already in Place','Not Interested','Client Hung Up','Missed Call','Called Wrong Number','Language Barrier','Dead Air / No Response','Disqualified: Other']);
  const text = el => (el?.textContent || '').replace(/\s+/g,' ').trim();
  function capture(doc, config, capturedAt) {
    if (!config || !/^[0-9a-f-]{36}$/i.test(config.source_id) || !Array.isArray(config.agents) || !config.agents.length) throw Error('Load a reviewed source configuration.');
    if (doc.title !== `Calls - ${config.agency_label}`) throw Error('Source agency does not match the reviewed configuration.');
    const names = config.agents.map(a => a.source_agent_name);
    if (new Set(names).size !== names.length) throw Error('Agent names are ambiguous.');
    const view = [...doc.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.trim() === 'Personal Spend'));
    if (!view || view.selectedOptions[0]?.textContent.trim() !== 'Agency View') throw Error('Select Agency View before capturing.');
    const region = doc.querySelector('[aria-label="Call details"]');
    const table = region?.querySelector('table');
    if (!table) throw Error('Open the agency Call Reporting detail table.');
    const headers = [...table.querySelectorAll('thead th')].map(text);
    const required = ['ID','Direction','Agent Name','Call Date','Call Length','Disposition','AI Disposition','Cost','Call Type'];
    if (required.some(h => headers.filter(x => x === h).length !== 1)) throw Error('Show ID, direction, agent, date, length, both dispositions, cost and call type columns.');
    const calls = [];
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      const get = label => text(cells[headers.indexOf(label)]);
      const name = get('Agent Name');
      if (!names.includes(name)) continue;
      const campaign = get('Call Type');
      if (!['Medicare Raw Calls','MedCare Inbound Calls'].includes(campaign)) continue;
      const id = get('ID');
      if (!/^[1-9]\d{0,18}$/.test(id)) throw Error('A selected row is missing a stable source call ID.');
      const when = get('Call Date').match(/\((\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{4})\)$/);
      if (!when) throw Error('A selected call has an unsupported timestamp.');
      const length = get('Call Length');
      const parts = length.split(':');
      if (length !== 'LIVE' && (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(length) || parts.slice(1).some(p => Number(p) > 59))) throw Error('A selected call has an unsupported duration.');
      const duration = length === 'LIVE' ? null : parts.reduce((total,p) => total*60+Number(p),0);
      const cost = get('Cost');
      if (!/^\$\d+(,\d{3})*\.\d{2}$/.test(cost)) throw Error('A selected call has an unsupported cost.');
      const cents = Number(cost.replace(/[$,.]/g,''));
      const dispo = (label) => {
        let value = get(label);
        if (!value || value === 'Ai Dispo Missing' || value === '—' || value === '-') return null;
        if (label === 'Disposition' && /^Enrolled(?:\s|$)/.test(value)) value='Enrolled';
        if (!outcomes.has(value)) throw Error('An unrecognized disposition needs a reviewed vocabulary update.');
        return value;
      };
      const count = get('Disposition').match(/(\d+) enrollment(?:s)? recorded for this call\./);
      const direction = get('Direction');
      if (!['Inbound','Outbound'].includes(direction)) throw Error('Unsupported call direction.');
      calls.push({source_call_id:id,source_agent_name:name,campaign,direction,call_local:when[1],duration_seconds:duration,cost_cents:cents,human_disposition:dispo('Disposition'),ai_disposition:dispo('AI Disposition'),enrollment_count:count?Number(count[1]):null});
    }
    if (!calls.length || calls.length>500) throw Error('Capture must contain 1–500 selected calls.');
    if (new Set(calls.map(c=>c.source_call_id)).size!==calls.length) throw Error('Duplicate source call IDs in view.');
    return {schema_version:1,source_id:config.source_id,agency_label:config.agency_label,captured_at:capturedAt,timezone:'America/Chicago',billing_view:'agency',coverage:'visible_rows',calls};
  }
  globalThis.wayfinderCaptureAllCallsReport = capture;
})();
