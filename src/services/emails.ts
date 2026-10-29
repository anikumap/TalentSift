type Email = { subject: string; body: string };

export function inviteEmail(name: string, jobTitle: string, orgName: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Next step for your ${jobTitle} application at ${orgName}`,
    body: [
      `Hi ${first},`,
      "",
      `Thank you for applying for the ${jobTitle} role at ${orgName}. We liked your answers and would like to talk with you.`,
      "",
      "Someone from our team will contact you within 2 working days to arrange a short conversation. You can reply to this email if you have any questions.",
      "",
      `— The ${orgName} hiring team`,
    ].join("\n"),
  };
}

export function rejectionEmail(name: string, jobTitle: string, orgName: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Your application for ${jobTitle} at ${orgName}`,
    body: [
      `Hi ${first},`,
      "",
      `Thank you for taking the time to apply for the ${jobTitle} role at ${orgName}. We read every application carefully.`,
      "",
      "We won't be moving forward with your application for this role. This decision was made by a person on our team, and it isn't a judgement of your worth or your potential.",
      "",
      "We'd be glad to see you apply again for future openings.",
      "",
      `Wishing you all the best,\nThe ${orgName} hiring team`,
    ].join("\n"),
  };
}
