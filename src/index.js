client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log(`Logged in as ${client.user.tag}!`);
  }); 