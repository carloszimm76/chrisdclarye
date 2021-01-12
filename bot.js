const COMMAND_PREFIX = '.';

const auth = require('./auth.json');
const Eris = require('eris');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const { Collection, Message } = require('eris');

const bot = new Eris(auth.token);

bot.on("ready", () => {
	console.log("Ready!");
});

let q = new Queue();

var respond;
var searchResults = [];

bot.on("messageCreate", async msg => {

    var textChannel = msg.channel.id;

    if ( msg.author.bot )
        return;

    if ( msg.content.substring(0,1) == COMMAND_PREFIX ) {

        var args = msg.content.substring(1).split(' ');
        var cmd = args[0];
        args = args.splice(1);

        switch ( cmd ) {

            case 'hello':
                await bot.createMessage(textChannel, `Hello World!`);
                break;
            
            case 'clear':
                q.clear();
                bot.createMessage(textChannel, {
                    embed: {
                        description: `Queue cleared!`
                    }
                });
                break;

            case 'q':
            case 'queue': // show queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                } else {
                    showQueue(textChannel);
                }
                
                break;
            
            case 'r':
            case 'remove': // remove specific song from queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                    break;
                }
                var num = parseInt(args[0], 10);
                if ( isNaN(num) || num < 1 || q.size() < num ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Can't remove that from the queue.`
                        }
                    });
                } else {
                    remove(textChannel, num);
                }
                break;
            
            case 'skip':
                connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                var voiceChannel = msg.member.voiceState.channelID;
                if ( !connection ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Not playing music rn.`
                        }
                    });
                } else {
                    var botVC = parseInt(connection.channelID, 10);
                    var memberVC = parseInt(voiceChannel, 10);
                    if ( botVC == memberVC ) {
                        connection.stopPlaying();

                    } else {
                        bot.createMessage(textChannel, {
                            embed: {
                                description: `Must be connected to VC to skip.`
                            }
                        });
                    }
                }
                
                break;
            
            case 'p':
            case 'play':
                if ( args.length > 0 ){
                    if ( ytdl.validateURL(args[0])){
                        connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( !connection ) { // join vc
                            join( textChannel, msg.member, args[0] );
                        } else { // play song
                            q.enqueue(args[0]);
                            play( connection, textChannel, msg.member );
                        }
                    } else {
                        search(textChannel, msg, args.join(' '));
                    }
                    
                } else {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `No URL specified.`
                        }
                    });
                }
                
                break;
            default:
                bot.createMessage(textChannel, {
                    embed: {
                        description: `Not a valid command.`
                    }
                });
        }
    } 

    else if ( respond != null && respond.author.id == msg.author.id && respond.channel.id == msg.channel.id ) {
        var num = parseInt(msg.content, 10);

        if ( isNaN(num) || num < 1 || num > 5 ) {
            bot.createMessage(textChannel, {
                embed: {
                    description: `Invalid selection.`
                }
            });
        } else {
            respond = null;
            connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
            if ( !connection ) { // join vc
                join( textChannel, msg.member, searchResults[num-1] );
            } else { // play song
                q.enqueue(searchResults[num-1]);
                play( connection, textChannel, msg.member );
            }
            searchResults = [];
        }
    }
    
})

bot.on("error", (err) => {
    console.error(err);
})

async function search( textChannel, msg, query ) {
    searchResults = [];
    const results = await ytsr(query, { limit: 20 });
    const videos = results.items.filter(x => x.type === "video");

    console.log(videos);
    
    var message = ``;
    
    for ( i = 0; i < 5; i++ ) {
        message += `${i+1} - [${videos[i].title}](${videos[i].url})\n`;
        searchResults.push(videos[i].url);
    }
    bot.createMessage(textChannel, {
        embed: {
            title: "Search results",
            description: message
        }
    });
    respond = msg;

}

async function remove( textChannel, n ) {
    const removed = q.remove(n);
    var info = await ytdl.getBasicInfo(removed);

    bot.createMessage(textChannel, {
        embed: {
            description: `Removed [${info.videoDetails.title}](${removed}) from the queue.`
        }
    });
}

async function showQueue( textChannel ) {
    var message = ``;

    for ( i = 0; i < q.size(); i++ ) {
        var info = await ytdl.getBasicInfo(q.get(i));
        message += `${i+1}: [${info.videoDetails.title}](${q.get(i)})\n`;
        
    }
    bot.createMessage(textChannel, {
        embed: {
            title: "Queue",
            description: message
        }
    });
}

async function join( textChannel, member, url) {
    var voiceChannel = member.voiceState.channelID;
    if ( voiceChannel != null ) {
        q.enqueue(url);
        connection = await bot.joinVoiceChannel(voiceChannel);
        play( connection, textChannel );

    } else {
        bot.createMessage(textChannel, {
            embed: {
                description: `Join a voice channel to play music.`
            }
        });
    }
}

async function play( connection, textChannel ) {
    if( !connection.playing ) {
        console.log("Getting info...")
        try {

            const info = await ytdl.getBasicInfo(q.peek());
            var nowPlaying = await bot.createMessage(textChannel, {
                embed: {
                    description: `Now playing: [${info.videoDetails.title}](${q.peek()})`
                }
            });
            const stream = ytdl(q.peek(), {filter: "audioonly", highWaterMark: 1<<21}).on('response', () => {
                if ( !connection )
                    return;
                
                if ( connection.ready ) {
                    try {
                        connection.play(stream);
                        q.dequeue();
                    } catch (error) {
                        console.error(error);
                        play(connection, textChannel);
                    }
                } else {
                    console.log("Connection not ready");
                }
            });
    
            connection.once('end', () => {
                bot.deleteMessage( textChannel, nowPlaying.id );
                if ( !q.isEmpty() ){
                    play( connection, textChannel );
                } else {
                    bot.leaveVoiceChannel(connection.channelID);
                }
            })

        } catch(err) {
            console.error(err);
            bot.createMessage(textChannel, {
                embed: {
                    description: `Problem fetching info, video might be age-restricted.`
                }
            });
            q.dequeue();
        }
        

        

    } else {
        try {
            const info = await ytdl.getBasicInfo(q.end());
            bot.createMessage(textChannel, {
                embed: {
                    description: `Queued [${info.videoDetails.title}](${q.end()})`
                }
            });
        } catch(err) {
            console.error(err);
            bot.createMessage(textChannel, {
                embed: {
                    description: `Problem fetching info, video might be age-restricted.`
                }
            });
            q.pop();
        }
    }
}

function Queue() {
    this.elements = [];
}

Queue.prototype.enqueue = function (e) {
    this.elements.push(e);
}

Queue.prototype.dequeue = function () {
    return this.elements.shift();
}

Queue.prototype.pop = function () {
    return this.elements.pop();
}

Queue.prototype.isEmpty = function () {
    return this.elements.length == 0;
}

Queue.prototype.peek = function () { 
    return !this.isEmpty() ? this.elements[0] : undefined;
}

Queue.prototype.end = function () {
    return !this.isEmpty() ? this.elements[this.elements.length - 1] : undefined;
}

Queue.prototype.remove = function (n) {
    return this.elements.splice(n-1, 1);
}

Queue.prototype.clear = function () {
    this.elements = [];
}

Queue.prototype.get = function (n) {
    return this.elements[n];
}

Queue.prototype.size = function () {
    return this.elements.length;
}


bot.connect();
