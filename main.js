var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var messageView = require('./modules/messageView.js');
var imapHandler = require('./modules/imapHandler.js');
var dbHandler = require('./modules/dbHandler.js');

$(function(){

  initialize();

  function initialize(){
    dbHandler.feedIndexedDB(window.indexedDB); //hack-ish, but needed
    mailboxView.onSelect(emailSelected);
    update();
  }

  function emailSelected(uid){
    dbHandler.getMailFromLocalBox('INBOX', uid, function(mail_obj){
      messageView.clear();
      dbHandler.getThreadMessages(mail_obj.thread_id, function(mail_objs){
        markRead(mail_objs);
        messageView.displayMessages(mail_objs);
      });
    });
  }

  function update(){
    console.log('updatingBox');
    printMail();
    dbHandler.syncBox('INBOX', function(){
      setTimeout(update, 60000);
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
      mailboxView.printMessage(mail_object);
      printed_threads.push(mail_object.thread_id);
    });
  }

});
