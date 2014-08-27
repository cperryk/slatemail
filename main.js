var fs = require('fs');
var MailParser = require("mailparser").MailParser;
var Box = require('./modules/mailboxView.js');
var MessageViewer = require('./modules/messageView.js');
var imapHandler = new require("./modules/imapHandler.js");


var $ = require('jquery');

$(function(){
  var viewer = new MessageViewer();

  updateBox();


  function updateBox(){
    console.log('updatingBox');
    printMail();
    dbHandler.syncBox('INBOX', function(){
      setTimeout(updateBox, 60000);
    });
  }

  var box = new Box({
    on_select:emailSelected
  });

  function emailSelected(uid){
    dbHandler.getMailFromLocalBox('INBOX', uid, function(mail_obj){
      viewer.clear();
      dbHandler.getThreadMessages(mail_obj.thread_id, function(mail_objs){
        markRead(mail_objs);
        viewer.displayMessages(mail_objs);
      });
    });
  }
  function markRead(mail_objs){
    mail_objs.forEach(function(mail_obj){
      if(mail_obj.flags.indexOf('\\Seen')===-1){
        imapHandler.markSeen(mail_obj.uid);
      }
    });
  }

  function printMail(){
    var printed_threads = [];
    dbHandler.getMessagesFromMailbox('INBOX',function(mail_object){
      if(printed_threads.indexOf(mail_object.thread_id)>-1){
        return;
      }
      box.printMessage(mail_object);
      printed_threads.push(mail_object.thread_id);
    });
  }

});
