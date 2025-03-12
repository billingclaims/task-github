const PORT = process.env.PORT || 3000;

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log(`Logged in as ${client.user.tag}!`);
  }); 